import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo, AccountPickerSheet, Text, ThemeModal } from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { type SplitDraftInput, useTransactions } from '~/context/AppContext';
import {
  evaluateExpression,
  formatMoney as formatCalcAmount,
  sanitizeInitialAmount,
} from '~/features/transactions/components/editor/calculatorEngine';
import { MiniNumpad } from '~/features/transactions/components/editor/MiniNumpad';
import {
  type PaidByOption,
  PaidByPickerSheet,
} from '~/features/transactions/components/editor/PaidByPickerSheet';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { recentSplitPersonNames } from '~/features/transactions/lib/settleUp';
import {
  applyPercent,
  nextEditableAmountIndex,
  spreadOverShares,
  sumUnpaidRows,
} from '~/features/transactions/lib/splitMath';
import { draftPayer, storedFriendPaidRow } from '~/features/transactions/lib/splitPayer';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup } from '~/types';
import { cn } from '~/utils';
import { formatAmount } from '~/utils/formatters';
import { newId } from '~/utils/id';

export interface SplitDraft {
  id?: string;
  personName: string;
  amount: string;
  isSelf: boolean;
  paybackAccountId: string | null;
  /** Set once a friend marks paid. paidTransactionId is null for same-account paybacks
   * (no transfer tx is created — the parent expense is just reduced). */
  paid?: { paidAt: string; paidTransactionId: string | null };
  /** The share this row belongs to (`splitShareKey`); a share paid in parts
   *  has paid rows beside its unpaid one. Absent on a row added here. */
  shareKey?: string;
  /** This friend paid the bill, so the user owes them the Me row
   *  (features/transactions/lib/splitPayer.ts). At most one row. */
  isPayer?: boolean;
  /** On the payer's row once the user has paid them back: who paid is then
   *  fixed until that payment is undone in Balances. */
  settled?: { paidAt: string };
  /** On the payer's row: what the user has already paid them in parts. Their
   *  own share cannot go below it, and who paid is fixed while it is there. */
  paidBack?: number;
  /** The Cloud Sync account this person is, once people can be real users. */
  memberId?: string | null;
  /**
   * The album person this row is for (an active album's "Split with", or a
   * shared album's member). Dropped when the name is retyped: the row is then
   * whoever that name is.
   */
  albumMemberId?: string | null;
}

interface SplitBillModalProps {
  visible: boolean;
  /**
   * 'modal' wraps the body in a slide-up ThemeModal (legacy). 'page' renders
   * the body bare so a navigation route can present it as a standard screen.
   */
  presentation?: 'modal' | 'page';
  /** One-shot toast shown on mount (e.g. a save-time mismatch that sent the
   *  user here) — the editor's own toast would be hidden behind this page. */
  initialToast?: string;
  /**
   * Itemized ("split before amount") mode: there is no fixed total — the user
   * enters what each person pays and the parent amount is computed on Done.
   * Decided when the flow opens and constant for the visit.
   */
  itemized?: boolean;
  /** Discard staged edits and close. Wired to the back chevron + system close. */
  onCancel: () => void;
  /** Commit staged edits and close. Wired to the Done button. */
  onDone: () => void;
  /**
   * The Done button's word, when committing does more than close: "Add" when
   * the page is confirming a new bill's split before it is saved.
   */
  doneLabel?: string;
  /** Album members Paid by does not offer (joined members of a shared album but the user). */
  payerExcludedMemberIds?: ReadonlySet<string>;
  /** Current parent expense amount (already reduced by any paid splits). */
  total: number;
  defaultAccountId: string | null;
  splits: SplitDraft[];
  /** Percentage adjustments supply the matching parent total in fixed-total mode. */
  onChange: (splits: SplitDraft[], adjustedTotal?: number) => void;
  splitEvenly: boolean;
  onSplitEvenlyChange: (v: boolean) => void;
  accounts: Account[];
  accountGroups: AccountGroup[];
  currencySymbol: string;
  formatSettings?: Parameters<typeof formatAmount>[1];
  onMarkPaid?: (splitId: string) => void;
  onMarkUnpaid?: (splitId: string) => void;
  /** Splits the user marked paid in this editor session — used to gate the
   *  Undo affordance. Once the editor saves and unmounts this set is gone. */
  newlyPaidIds: Set<string>;
}

const styles = StyleSheet.create({
  nameInput: {
    flex: 1,
  },
});

// Tax & service percentage stepper bounds. Negative values are
// a discount; applyPercent supports anything > -100.
const DEFAULT_ADJUST_PERCENT = 10;
const MIN_ADJUST_PERCENT = -99;
const MAX_ADJUST_PERCENT = 100;

function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const amounts: number[] = [];
  for (let i = 0; i < count; i += 1) {
    amounts.push((base + (i < remainder ? 1 : 0)) / 100);
  }
  return amounts;
}

function autoBalanceSelf(rows: SplitDraft[], total: number, changedIndex?: number): SplitDraft[] {
  const selfIndex = rows.findIndex((r) => r.isSelf);
  if (selfIndex < 0) return rows;
  if (changedIndex !== undefined && changedIndex === selfIndex) return rows;
  let othersTotal = 0;
  rows.forEach((r, i) => {
    if (i === selfIndex) return;
    if (r.paid) {
      // Paid rows are "settled" — they don't count against the current outstanding total.
      return;
    }
    const v = Number(r.amount);
    if (Number.isFinite(v)) othersTotal += v;
  });
  // Floor Me at 0 — friends can't push Me into a negative share.
  const selfAmount = Math.max(0, Math.round((total - othersTotal) * 100) / 100);
  return rows.map((r, i) => (i === selfIndex ? { ...r, amount: selfAmount.toFixed(2) } : r));
}

/** Even-split: divide `total` across all unpaid rows (Me + unpaid friends).
 *  Paid rows keep their amount — they're already settled — and a share paid
 *  in part owes its even portion less what it paid. */
function distributeEvenlyAcrossUnpaid(rows: SplitDraft[], total: number): SplitDraft[] {
  if (rows.length === 0) return rows;
  return spreadOverShares(rows, total, () => true);
}

/** Mirror of autoBalanceSelf: when the user edits Me, redistribute the
 *  remaining (total - Me) evenly across the unpaid friend rows. Floors at 0
 *  so friends can't go negative if Me eats more than the total. */
function autoBalanceFriends(rows: SplitDraft[], total: number): SplitDraft[] {
  const selfIndex = rows.findIndex((r) => r.isSelf);
  if (selfIndex < 0) return rows;
  const selfAmount = Number(rows[selfIndex]?.amount);
  const safeSelf = Number.isFinite(selfAmount) ? Math.max(0, selfAmount) : 0;
  const remaining = Math.max(0, Math.round((total - safeSelf) * 100) / 100);
  return spreadOverShares(rows, remaining, (_row, index) => index !== selfIndex);
}

/** Convert the modal's `SplitDraft[]` into the `SplitDraftInput[]` shape that
 *  AppContext mutations expect. Trims names, parses amounts, falls back to the
 *  parent transaction's account when no payback account was picked. */
function toSplitDraftInputs(
  splits: SplitDraft[],
  fallbackAccountId: string | null | undefined,
): SplitDraftInput[] {
  // A bill a friend paid: nobody on it owes the user, so every friend row
  // holds its share in `shareAmount` beside a zero `amount`, and names no
  // payback account (`storedFriendPaidRow`).
  const friendPaid = draftPayer(splits) !== null;
  return splits.map((s, idx) => {
    const row = {
      id: s.id,
      personName: s.personName.trim() || null,
      amount: Number(s.amount) || 0,
      isSelf: s.isSelf,
      paybackAccountId: s.paybackAccountId ?? fallbackAccountId ?? null,
      sortOrder: idx,
      paid: s.paid,
      memberId: s.memberId ?? null,
      albumMemberId: s.albumMemberId ?? null,
    };
    if (!friendPaid) return { ...row, isPayer: false, shareAmount: null };
    return {
      ...storedFriendPaidRow(row),
      paybackAccountId: s.isPayer && s.settled ? (fallbackAccountId ?? null) : null,
      paid: undefined,
      isPayer: !s.isSelf && !!s.isPayer,
    };
  });
}

export const splitsHelpers = {
  distributeEvenly,
  toSplitDraftInputs,
  distributeEvenlyAcrossUnpaid,
  autoBalanceSelf,
};

/**
 * Wraps an unpaid friend row in a left-swipe gesture that reveals Mark paid
 * (edit-only) and Delete actions. Replaces the inline trash / mark-paid
 * buttons so the resting row stays clean. The revealed actions are opaque and
 * sit behind an opaque foreground so nothing shows through at rest.
 */
function SplitSwipeRow({
  children,
  showMarkPaid,
  onMarkPaid,
  onDelete,
  themeColors,
}: {
  children: React.ReactNode;
  showMarkPaid: boolean;
  onMarkPaid: () => void;
  onDelete: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const renderRightActions = useCallback(
    () => (
      <View className="flex-row items-stretch">
        {showMarkPaid ? (
          <Pressable
            onPress={() => {
              swipeRef.current?.close();
              void triggerHaptic('success');
              onMarkPaid();
            }}
            className="w-[78px] items-center justify-center gap-1"
            style={{ backgroundColor: themeColors.success }}
          >
            <Check size={16} color="#FFFFFF" />
            <Text variant="caption" className="font-medium text-white">
              {I18n.t('transactions.editor.split.mark_paid')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            void triggerHaptic('warning');
            onDelete();
          }}
          className="w-[78px] items-center justify-center gap-1"
          style={{ backgroundColor: themeColors.error }}
        >
          <Trash2 size={16} color="#FFFFFF" />
          <Text variant="caption" className="font-medium text-white">
            {I18n.t('common.delete')}
          </Text>
        </Pressable>
      </View>
    ),
    [showMarkPaid, onMarkPaid, onDelete, themeColors.success, themeColors.error],
  );
  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderRightActions}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

export function SplitBillModal({
  visible,
  presentation = 'modal',
  initialToast,
  itemized = false,
  onCancel,
  onDone,
  doneLabel,
  payerExcludedMemberIds,
  total,
  defaultAccountId,
  splits,
  onChange,
  splitEvenly,
  onSplitEvenlyChange,
  accounts,
  accountGroups,
  currencySymbol,
  formatSettings,
  onMarkPaid,
  onMarkUnpaid,
  newlyPaidIds,
}: SplitBillModalProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  // The user's row reads as their Settings name and photo ("Me" without).
  const me = useSelfPerson();
  // Row key whose "paid back to" account is being chosen. Set when the user taps
  // Mark paid on a row's swipe actions; picking an account settles that row.
  const [accountPickerForKey, setAccountPickerForKey] = useState<string | null>(null);

  // One-shot toast surfaced on this page (e.g. a save-time split mismatch that
  // redirected the user here). Shown once when the message arrives.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initialToast) return;
    void triggerHaptic('warning');
    setToast(initialToast);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [initialToast]);

  // Track the keyboard so the sticky sum bar can sit just above it. iOS
  // pageSheet doesn't reliably hand the keyboard frame to KeyboardAvoidingView,
  // so we drive the offset manually.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    // Always reset on visibility change. Listeners are torn down when the
    // modal hides — without this, a stale keyboardHeight from the previous
    // session would float the sum bar on the next open.
    setKeyboardHeight(0);
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  // Name autocomplete: names entered on past splits, most-recent first.
  const { transactions } = useTransactions();
  const [focusedNameIndex, setFocusedNameIndex] = useState<number | null>(null);
  // Which row's amount the mini numpad is editing (null = numpad hidden). The
  // live raw expression ("12+3") is held separately so the row can display it.
  const [focusedAmountIndex, setFocusedAmountIndex] = useState<number | null>(null);
  const [focusedExpression, setFocusedExpression] = useState('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentNames = useMemo(
    () => (visible ? recentSplitPersonNames(transactions) : []),
    [visible, transactions],
  );

  const handleNameFocus = useCallback((index: number) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    // Editing a name uses the OS keyboard — hide the mini numpad.
    setFocusedAmountIndex(null);
    setFocusedNameIndex(index);
  }, []);
  const handleNameBlur = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    // Delay clearing so a tap on a suggestion chip lands before the bar unmounts.
    blurTimer.current = setTimeout(() => setFocusedNameIndex(null), 120);
  }, []);
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );
  // Drop any stale focus when the modal hides so the drop-up / numpad can't linger.
  useEffect(() => {
    if (!visible) {
      setFocusedNameIndex(null);
      setFocusedAmountIndex(null);
    }
  }, [visible]);

  // Suggestions for the focused name field: recent names matching what has been
  // typed and not already used by another row, most recent first.
  const nameSuggestions = useMemo(() => {
    if (focusedNameIndex === null) return [];
    const row = splits[focusedNameIndex];
    if (!row || row.isSelf || row.paid) return [];
    const query = row.personName.trim().toLowerCase();
    const usedByOthers = new Set(
      splits
        .filter((_, i) => i !== focusedNameIndex)
        .map((s) => s.personName.trim().toLowerCase())
        .filter((n) => n.length > 0),
    );
    return recentNames
      .filter((n) => !usedByOthers.has(n.toLowerCase()))
      .filter((n) => {
        const lower = n.toLowerCase();
        return query ? lower.includes(query) && lower !== query : true;
      })
      .slice(0, 6);
  }, [focusedNameIndex, recentNames, splits]);

  const applyNameSuggestion = useCallback(
    (name: string) => {
      if (focusedNameIndex === null) return;
      void triggerHaptic('selection');
      onChange(
        splits.map((row, i) => (i === focusedNameIndex ? { ...row, personName: name } : row)),
      );
    },
    [focusedNameIndex, onChange, splits],
  );

  // Sum of UNPAID splits (Me + outstanding friends). Paid splits are settled
  // and have already reduced the parent amount.
  const unpaidSum = useMemo(() => {
    let s = 0;
    splits.forEach((sp) => {
      if (sp.paid) return;
      const v = Number(sp.amount);
      if (Number.isFinite(v)) s += v;
    });
    return Math.round(s * 100) / 100;
  }, [splits]);

  const diff = useMemo(() => Math.round((total - unpaidSum) * 100) / 100, [total, unpaidSum]);

  // Who paid the bill: the user (the default), or the friend whose row carries
  // `isPayer`. When a friend paid, the user owes them the Me row and nobody
  // owes the user, so there is nothing here to mark paid.
  const payerRow = useMemo(() => draftPayer(splits), [splits]);
  const friendPaid = payerRow !== null;
  const hasFriends = splits.some((s) => !s.isSelf);
  // A recorded payment fixes who paid: a friend's payback lowered the expense
  // the user paid, and the user's own payback put it on an account.
  const paidBack = payerRow?.paidBack ?? 0;
  const payerLocked = splits.some((s) => !!s.paid) || !!payerRow?.settled || paidBack > 0;
  const selfAmount = useMemo(() => {
    const value = Number(splits.find((s) => s.isSelf)?.amount);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }, [splits]);
  const friendsOwe = useMemo(
    () => (friendPaid ? 0 : Math.max(0, Math.round((unpaidSum - selfAmount) * 100) / 100)),
    [friendPaid, selfAmount, unpaidSum],
  );

  // The payer's name as the Paid by row shows it, and the people it offers.
  const payerLabel = payerRow
    ? payerRow.personName.trim() || I18n.t('transactions.settleUp.someone')
    : me.name;
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const payerOptions = useMemo<PaidByOption[]>(
    () =>
      splits.flatMap((row, index) => {
        // A friend who has paid the user back is not the one who paid the bill.
        if (row.paid && !row.isSelf) return [];
        // Only you can say you paid: someone who joined the album says so
        // themselves (README: Who can change what).
        if (!row.isSelf && row.albumMemberId && payerExcludedMemberIds?.has(row.albumMemberId)) {
          return [];
        }
        return [
          {
            key: row.id ?? `row_${index}`,
            rowIndex: row.isSelf ? null : index,
            name: row.isSelf
              ? me.name
              : row.personName.trim() || I18n.t('transactions.settleUp.someone'),
            partyKey: row.isSelf ? null : debtPartyKey(row.personName, row.memberId),
            selected: row.isSelf ? !friendPaid : row === payerRow,
          },
        ];
      }),
    [friendPaid, me.name, payerExcludedMemberIds, payerRow, splits],
  );

  const handlePayerChange = useCallback(
    (payerIndex: number | null) => {
      if (payerLocked) {
        void triggerHaptic('warning');
        setToast(I18n.t('transactions.editor.split.paid_by_locked'));
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 2800);
        return;
      }
      void triggerHaptic('selection');
      onChange(
        splits.map((row, i) => {
          const isPayer = payerIndex !== null && i === payerIndex && !row.isSelf;
          return row.isPayer === isPayer || (!row.isPayer && !isPayer) ? row : { ...row, isPayer };
        }),
      );
    },
    [onChange, payerLocked, splits],
  );

  // Tax & service adjustment: a single percentage stepper.
  // Applying is a one-shot transform of the row amounts; applying twice
  // stacks intentionally (service charge, then GST).
  const [percent, setPercent] = useState(DEFAULT_ADJUST_PERCENT);
  useEffect(() => {
    setPercent(DEFAULT_ADJUST_PERCENT);
  }, [visible]);

  const clampPercent = useCallback(
    (value: number) => Math.min(MAX_ADJUST_PERCENT, Math.max(MIN_ADJUST_PERCENT, value)),
    [],
  );

  // Press-and-hold to fast-adjust: one immediate step (+ haptic), then repeat
  // every 90ms after a 350ms delay. No per-tick haptic so it doesn't buzz.
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopHold = useCallback(() => {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  }, []);
  const startHold = useCallback(
    (delta: number) => {
      stopHold();
      void triggerHaptic('selection');
      setPercent((current) => clampPercent(current + delta));
      holdTimeoutRef.current = setTimeout(() => {
        holdIntervalRef.current = setInterval(() => {
          // Self-terminate at the bound: reaching min/max disables the button,
          // and a disabled Pressable may never deliver onPressOut, so stop the
          // interval here rather than relying on it to clear the timer.
          let atBound = false;
          setPercent((current) => {
            const nextValue = clampPercent(current + delta);
            atBound = nextValue === current;
            return nextValue;
          });
          if (atBound) stopHold();
        }, 90);
      }, 350);
    },
    [clampPercent, stopHold],
  );
  useEffect(() => stopHold, [stopHold]);

  // Nothing to scale (no amounts) or a 0% no-op → keep Apply disabled so it
  // never fires a "success" for a change that doesn't happen.
  const canApplyPercent = unpaidSum > 0 && percent !== 0;

  const handleApplyPercent = useCallback(() => {
    if (percent === 0) return;
    const next = applyPercent(splits, percent);
    if (!next) return;
    void triggerHaptic('success');
    onChange(next, itemized ? undefined : sumUnpaidRows(next));
    Keyboard.dismiss();
    // Close the mini numpad. Without this the focused row keeps showing its live
    // expression (not the freshly scaled amount) and confirming the pad would
    // overwrite the applied percentage — so applying appeared to do nothing on
    // the highlighted field.
    setFocusedAmountIndex(null);
    setFocusedExpression('');
  }, [itemized, onChange, percent, splits]);

  const formatMoney = useCallback(
    (n: number) => {
      if (formatSettings) return formatAmount(n, formatSettings);
      return `${currencySymbol}${n.toFixed(2)}`;
    },
    [currencySymbol, formatSettings],
  );

  const applyEvenSplit = useCallback(
    (rows: SplitDraft[]) => distributeEvenlyAcrossUnpaid(rows, total),
    [total],
  );

  const handleToggleEven = useCallback(
    (next: boolean) => {
      void triggerHaptic('selection');
      onSplitEvenlyChange(next);
      if (next) onChange(applyEvenSplit(splits));
    },
    [applyEvenSplit, onChange, onSplitEvenlyChange, splits],
  );

  const handleAddPerson = useCallback(() => {
    void triggerHaptic('selection');
    const next: SplitDraft[] = [
      ...splits,
      {
        id: newId(),
        personName: '',
        amount: '0',
        isSelf: false,
        paybackAccountId: defaultAccountId,
      },
    ];
    if (itemized) {
      onChange(next);
      return;
    }
    onChange(splitEvenly ? applyEvenSplit(next) : autoBalanceSelf(next, total));
  }, [applyEvenSplit, defaultAccountId, itemized, onChange, splitEvenly, splits, total]);

  const handleRemove = useCallback(
    (index: number) => {
      void triggerHaptic('warning');
      const target = splits[index];
      if (!target || target.isSelf) return;
      // The friend the user has already paid back stays the payer until that
      // payment is undone: removing them would make it a bill the user paid.
      if (target.isPayer && (target.settled || (target.paidBack ?? 0) > 0)) {
        setToast(I18n.t('transactions.editor.split.paid_by_locked'));
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 2800);
        return;
      }
      // Removing a paid row drops the local entry but leaves the linked
      // transfer + parent's reduced amount alone — the user can clean up the
      // transfer separately from the activity list if they want.
      const next = splits.filter((_, i) => i !== index);
      if (itemized) {
        onChange(next);
        return;
      }
      onChange(splitEvenly ? applyEvenSplit(next) : autoBalanceSelf(next, total));
    },
    [applyEvenSplit, itemized, onChange, splitEvenly, splits, total],
  );

  const handleNameChange = useCallback(
    (index: number, value: string) => {
      onChange(
        splits.map((row, i) =>
          i === index ? { ...row, personName: value, albumMemberId: null } : row,
        ),
      );
    },
    [onChange, splits],
  );

  // Pure: apply `value` to row `index` and return the resulting rows (null when
  // the row can't be edited). Itemized rows are free-form; otherwise editing Me
  // redistributes across friends and editing a friend rebalances Me. Returning
  // the array (instead of only calling onChange) lets callers derive follow-up
  // state from the committed result rather than a stale `splits` closure.
  const computeAmountUpdate = useCallback(
    (rows: SplitDraft[], index: number, value: string): SplitDraft[] | null => {
      const target = rows[index];
      if (!target || target.paid) return null;
      // Strip anything other than digits + decimal point so '-' / letters can't
      // sneak in. Over-allocation is allowed; the sum bar shows the mismatch.
      const cleaned = value.replace(/[^0-9.]/g, '');
      const next = rows.map((row, i) => (i === index ? { ...row, amount: cleaned } : row));
      if (itemized) return next;
      return target.isSelf ? autoBalanceFriends(next, total) : autoBalanceSelf(next, total, index);
    },
    [itemized, total],
  );

  const handleAmountChange = useCallback(
    (index: number, value: string) => {
      const updated = computeAmountUpdate(splits, index, value);
      if (!updated) return;
      if (!itemized && splitEvenly) onSplitEvenlyChange(false);
      onChange(updated);
    },
    [computeAmountUpdate, itemized, onChange, onSplitEvenlyChange, splitEvenly, splits],
  );

  // Open the mini numpad on a row's amount: dismiss the OS keyboard (used by
  // name fields), hide the name drop-up, and seed the pad from the row value.
  const handleAmountFocus = useCallback(
    (index: number) => {
      const target = splits[index];
      if (!target || target.paid) return;
      void triggerHaptic('selection');
      Keyboard.dismiss();
      setFocusedNameIndex(null);
      setFocusedAmountIndex(index);
      setFocusedExpression(sanitizeInitialAmount(target.amount));
    },
    [splits],
  );

  // Each keystroke: keep the live expression for display and push the evaluated
  // value through the normal amount path (so distribute-mode balancing fires).
  const handleNumpadValueChange = useCallback(
    (expression: string) => {
      if (focusedAmountIndex === null) return;
      setFocusedExpression(expression);
      handleAmountChange(focusedAmountIndex, formatCalcAmount(evaluateExpression(expression)));
    },
    [focusedAmountIndex, handleAmountChange],
  );

  // Done: finalize the row (normalized 2dp), then advance to the next editable
  // row keeping the pad open, or close it when there is none left.
  const handleNumpadConfirm = useCallback(() => {
    if (focusedAmountIndex === null) return;
    const finalValue = formatCalcAmount(evaluateExpression(focusedExpression));
    // Commit and seed the next row from the SAME resulting array — deriving the
    // next seed from the `splits` closure would miss this commit's rebalance.
    const committed = computeAmountUpdate(splits, focusedAmountIndex, finalValue) ?? splits;
    if (!itemized && splitEvenly) onSplitEvenlyChange(false);
    onChange(committed);
    const next = nextEditableAmountIndex(committed, focusedAmountIndex);
    if (next === null) {
      setFocusedAmountIndex(null);
      setFocusedExpression('');
      return;
    }
    void triggerHaptic('selection');
    setFocusedAmountIndex(next);
    setFocusedExpression(sanitizeInitialAmount(committed[next]!.amount));
  }, [
    computeAmountUpdate,
    focusedAmountIndex,
    focusedExpression,
    itemized,
    onChange,
    onSplitEvenlyChange,
    splitEvenly,
    splits,
  ]);

  const sumMatches = Math.abs(diff) < 0.005;
  // Itemized mode has no fixed total to match — Done just needs something to
  // commit; the editor derives the parent amount from the rows.
  // The user's own share cannot drop below what they have already paid back.
  const belowPaidBack = friendPaid && selfAmount + 0.005 < paidBack;
  const canDone = (itemized ? unpaidSum > 0.004 : sumMatches) && !belowPaidBack;
  // Whether the sum bar shows its "all good" state (drives the check + hint).
  const sumComplete = itemized ? canDone : sumMatches;

  // Once the rows add up, the bar says what the split means for the user in
  // one line instead of repeating the total above: what they owe the friend
  // who paid, or what comes back to them from a bill they paid.
  const settlementLine = belowPaidBack
    ? I18n.t('transactions.editor.split.paid_floor', { amount: formatMoney(paidBack) })
    : !sumComplete
      ? null
      : friendPaid
        ? payerRow?.settled
          ? I18n.t('transactions.settleUp.you_paid_back', {
              name: payerRow.personName.trim() || I18n.t('transactions.settleUp.someone'),
            })
          : selfAmount > 0
            ? I18n.t('transactions.editor.split.you_owe_summary', {
                name: payerRow?.personName.trim() || I18n.t('transactions.settleUp.someone'),
                // What is still owed: the share less what is already paid back.
                amount: formatMoney(Math.max(0, selfAmount - paidBack)),
              })
            : I18n.t('transactions.editor.split.you_owe_nothing')
        : friendsOwe > 0
          ? I18n.t('transactions.editor.split.get_back_hint', { amount: formatMoney(friendsOwe) })
          : null;

  // The row whose "paid back to" account is being chosen after the user tapped
  // Mark paid on the swipe actions. Selecting an account settles that row.
  const accountPickerSplit = useMemo(() => {
    if (!accountPickerForKey) return null;
    const idx = splits.findIndex(
      (s, i) => (s.id ?? `new_${i}`) === accountPickerForKey && !s.isSelf,
    );
    return idx < 0 ? null : { index: idx };
  }, [accountPickerForKey, splits]);

  // Wrap the close paths to dismiss the keyboard first. Without this, an
  // in-flight TextInput keeps focus while the modal closes, the keyboard
  // stays up, and the keyboardWillHide event is missed by our listener.
  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    onCancel();
  }, [onCancel]);
  const handleDone = useCallback(() => {
    void triggerHaptic('success');
    Keyboard.dismiss();
    onDone();
  }, [onDone]);

  const body = (
    <>
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border/20">
          <View className="flex-1 flex-row items-center justify-start">
            <Pressable
              onPress={handleCancel}
              className="w-9 h-9 rounded-full bg-secondary items-center justify-center"
            >
              <ChevronLeft size={18} color={themeColors.text} />
            </Pressable>
          </View>
          <View className="shrink items-center justify-center px-2">
            <Text variant="bodyStrong" numberOfLines={1}>
              {I18n.t('transactions.editor.split.toggle_title')}
            </Text>
          </View>
          <View className="flex-1 flex-row items-center justify-end">
            <Pressable
              onPress={handleDone}
              disabled={!canDone}
              className={cn(
                'px-3.5 h-9 rounded-full items-center justify-center',
                canDone ? 'bg-primary' : 'bg-secondary',
              )}
              style={{ opacity: canDone ? 1 : 0.5 }}
            >
              <Text
                variant="caption"
                className={cn(
                  'font-medium',
                  canDone ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {doneLabel ?? I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header — same centered hero for both modes: itemized shows the live
              subtotal, fixed-total mode shows the amount. */}
          <View className="items-center px-4 pt-6 pb-2">
            <Text variant="caption" tone="muted">
              {I18n.t(
                itemized
                  ? 'transactions.editor.split.subtotal_label'
                  : friendPaid
                    ? 'transactions.editor.split.bill_total_label'
                    : 'transactions.editor.amount',
              )}
            </Text>
            <Text variant="title" className="mt-1 text-center">
              {formatMoney(itemized ? unpaidSum : total)}
            </Text>
            <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
          </View>

          {/* How the bill is settled, in one card: who paid it (Me, or a friend
              on it, in which case the user owes them their own share), and
              whether it is shared evenly. */}
          {hasFriends || !itemized ? (
            <View className="mx-4 mt-3 overflow-hidden rounded-[20px] border border-border/25 bg-card/60">
              {hasFriends ? (
                <Pressable
                  onPress={() => {
                    if (payerLocked) {
                      handlePayerChange(null);
                      return;
                    }
                    void triggerHaptic('selection');
                    Keyboard.dismiss();
                    setPayerPickerOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.editor.split.paid_by_chip', {
                    name: payerLabel,
                  })}
                  className="flex-row items-center gap-2.5 px-4 py-3 active:opacity-70"
                >
                  <Text variant="body" className="flex-1">
                    {I18n.t('transactions.editor.split.paid_by_label')}
                  </Text>
                  <PersonAvatar
                    name={payerLabel}
                    partyKey={
                      payerRow ? debtPartyKey(payerRow.personName, payerRow.memberId) : null
                    }
                    size={26}
                    imageUri={payerRow ? null : me.avatarUri}
                  />
                  <Text
                    variant="bodyStrong"
                    numberOfLines={1}
                    className="max-w-[45%]"
                    tone={payerLocked ? 'muted' : undefined}
                  >
                    {payerLabel}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              ) : null}
              {hasFriends && !itemized ? <View className="mx-4 h-[1px] bg-border/15" /> : null}
              {!itemized ? (
                <View className="flex-row items-center px-4 py-2">
                  <Text variant="body" className="flex-1">
                    {I18n.t('transactions.editor.split.even_toggle')}
                  </Text>
                  <Switch
                    value={splitEvenly}
                    onValueChange={handleToggleEven}
                    trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Person rows card */}
          <View className="mx-4 mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            {splits.map((row, index) => {
              const acct = row.paybackAccountId ? accountById.get(row.paybackAccountId) : null;
              const fallbackAcct = defaultAccountId ? accountById.get(defaultAccountId) : null;
              const effectiveAcct = acct ?? fallbackAcct ?? null;
              const acctLabel = effectiveAcct?.name ?? I18n.t('common.no_account');
              const disabledRow = !!row.paid;
              // On a bill a friend paid nobody owes the user: nothing to mark paid.
              const canMarkPaid =
                !friendPaid && !row.isSelf && !!row.id && !disabledRow && !!onMarkPaid;
              const isPayerRow = friendPaid && row === payerRow;
              const canUndo = disabledRow && !!row.id && !!onMarkUnpaid && newlyPaidIds.has(row.id);
              const rowKey = row.id ?? `new_${index}`;
              const isUnpaidFriend = !row.isSelf && !disabledRow;
              // Top line (avatar + name + amount) — identical for every row.
              // Reused as the swipeable foreground for unpaid friends and rendered
              // plainly for Me and already-paid rows.
              const topLine = (
                <View className="flex-row items-center gap-2.5">
                  {row.isSelf && me.avatarUri ? (
                    <PersonAvatar
                      name={me.name}
                      partyKey={null}
                      size={36}
                      imageUri={me.avatarUri}
                    />
                  ) : !row.isSelf &&
                    !disabledRow &&
                    focusedNameIndex !== index &&
                    row.personName.trim() ? (
                    // A named friend gets the colour they have everywhere else
                    // (Paid by, Balances, the album). The row being typed in keeps
                    // the static icon, so a keystroke never redraws its avatar.
                    <PersonAvatar
                      name={row.personName}
                      partyKey={debtPartyKey(row.personName, row.memberId)}
                      // h-9, beside the Me row's circle
                      size={31.5}
                    />
                  ) : (
                    <View
                      className={cn(
                        'h-9 w-9 rounded-full items-center justify-center',
                        row.isSelf
                          ? 'bg-primary/15'
                          : disabledRow
                            ? 'bg-success/15'
                            : 'bg-secondary/60',
                      )}
                    >
                      {disabledRow ? (
                        <Check size={14} color={themeColors.success} />
                      ) : row.isSelf ? (
                        <Text variant="caption" className="font-semibold text-primary">
                          {Array.from(me.name)[0]?.toUpperCase()}
                        </Text>
                      ) : (
                        <UserRound size={15} color={themeColors.textMuted} />
                      )}
                    </View>
                  )}

                  <TextInput
                    value={row.isSelf ? me.name : row.personName}
                    editable={!row.isSelf && !disabledRow}
                    onFocus={() => handleNameFocus(index)}
                    onBlur={handleNameBlur}
                    onChangeText={(text) => handleNameChange(index, text)}
                    placeholder={
                      row.isSelf
                        ? I18n.t('transactions.editor.split.me_label')
                        : I18n.t('transactions.editor.split.person_placeholder')
                    }
                    placeholderTextColor={`${themeColors.mutedForeground}99`}
                    style={[
                      SINGLE_LINE_TEXT_INPUT_STYLE,
                      styles.nameInput,
                      {
                        color: disabledRow ? themeColors.textMuted : themeColors.text,
                        fontSize: 15,
                      },
                    ]}
                  />

                  {isPayerRow ? (
                    <View className="rounded-full bg-success/15 px-2 py-0.5">
                      <Text variant="caption" className="font-medium text-success">
                        {I18n.t('transactions.editor.split.payer_tag')}
                      </Text>
                    </View>
                  ) : null}
                  <Text variant="caption" tone="muted">
                    {currencySymbol}
                  </Text>
                  <Pressable
                    onPress={() => handleAmountFocus(index)}
                    disabled={disabledRow}
                    className={cn(
                      'min-w-[64px] items-end justify-center rounded-lg px-2 py-1',
                      focusedAmountIndex === index ? 'border border-primary/45 bg-primary/10' : '',
                    )}
                  >
                    <Text
                      style={{
                        color: disabledRow ? themeColors.textMuted : themeColors.text,
                        fontSize: 15,
                      }}
                    >
                      {focusedAmountIndex === index ? focusedExpression || '0' : row.amount || '0'}
                    </Text>
                  </Pressable>
                </View>
              );
              return (
                <View key={rowKey}>
                  {index > 0 ? <View className="h-[1px] bg-border/15 mx-4" /> : null}
                  {isUnpaidFriend ? (
                    // Swipe left to reveal Mark paid (edit-only) + Delete. The
                    // account for "mark paid to" is chosen after tapping Mark paid,
                    // so the resting row carries no payback chip.
                    <SplitSwipeRow
                      showMarkPaid={canMarkPaid}
                      onMarkPaid={() => setAccountPickerForKey(rowKey)}
                      onDelete={() => handleRemove(index)}
                      themeColors={themeColors}
                    >
                      <View className="px-4 py-3" style={{ backgroundColor: themeColors.card }}>
                        {topLine}
                      </View>
                    </SplitSwipeRow>
                  ) : (
                    <View className="px-4 py-3">
                      {topLine}
                      {disabledRow ? (
                        <View className="flex-row items-center justify-between mt-2 pl-11 gap-2">
                          <View className="flex-1 min-w-0 flex-row items-center gap-1.5">
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {I18n.t('transactions.editor.split.paid_label', {
                                date: row.paid?.paidAt
                                  ? new Date(row.paid.paidAt).toLocaleDateString()
                                  : '',
                              })}
                              {' · '}
                            </Text>
                            {effectiveAcct ? (
                              <AccountLogo
                                logoId={effectiveAcct.logoId}
                                type={effectiveAcct.type}
                                goalEmoji={effectiveAcct.goalEmoji}
                                size={14}
                              />
                            ) : null}
                            <Text
                              variant="caption"
                              tone="muted"
                              numberOfLines={1}
                              className="shrink min-w-0"
                            >
                              {acctLabel}
                            </Text>
                          </View>
                          {canUndo ? (
                            <Pressable
                              onPress={() => {
                                void triggerHaptic('warning');
                                onMarkUnpaid?.(row.id ?? '');
                              }}
                              hitSlop={6}
                              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                              className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-secondary/50"
                            >
                              <RotateCcw size={11} color={themeColors.textMuted} />
                              <Text variant="caption" tone="muted">
                                {I18n.t('transactions.editor.split.undo_paid')}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}

            <View className="h-[1px] bg-border/15 mx-4" />

            <Pressable
              onPress={handleAddPerson}
              className="flex-row items-center gap-3 px-4 py-3.5"
            >
              <View className="h-7 w-7 rounded-full bg-primary/15 items-center justify-center">
                <Plus size={14} color={themeColors.primary} />
              </View>
              <Text variant="body" className="text-primary font-medium">
                {I18n.t('transactions.editor.split.add_person')}
              </Text>
            </Pressable>
          </View>

          {/* Tax & service: a percentage stepper applied
              proportionally on top of the entered amounts. */}
          <View className="mx-4 mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            <View className="px-4 pt-3 pb-1">
              <Text variant="caption" tone="muted">
                {percent < 0
                  ? I18n.t('transactions.editor.split.discount_title')
                  : I18n.t('transactions.editor.split.adjustments_title')}
              </Text>
            </View>
            <View className="px-4 pb-3 pt-1 flex-row items-center gap-3">
              <Pressable
                onPressIn={() => startHold(-1)}
                onPressOut={stopHold}
                disabled={percent <= MIN_ADJUST_PERCENT}
                hitSlop={6}
                className="h-8 w-8 rounded-full bg-secondary/60 items-center justify-center"
                style={{ opacity: percent <= MIN_ADJUST_PERCENT ? 0.4 : 1 }}
              >
                <Minus size={14} color={themeColors.text} />
              </Pressable>
              <Text variant="bodyStrong" className="min-w-[60px] text-center">
                {I18n.t('transactions.editor.split.percent_chip', { percent })}
              </Text>
              <Pressable
                onPressIn={() => startHold(1)}
                onPressOut={stopHold}
                disabled={percent >= MAX_ADJUST_PERCENT}
                hitSlop={6}
                className="h-8 w-8 rounded-full bg-secondary/60 items-center justify-center"
                style={{ opacity: percent >= MAX_ADJUST_PERCENT ? 0.4 : 1 }}
              >
                <Plus size={14} color={themeColors.text} />
              </Pressable>

              <View className="flex-1" />

              <Pressable
                onPress={handleApplyPercent}
                disabled={!canApplyPercent}
                className={cn(
                  'px-3.5 py-1.5 rounded-full active:opacity-80',
                  canApplyPercent ? 'bg-primary' : 'bg-secondary/60',
                )}
                style={{ opacity: canApplyPercent ? 1 : 0.4 }}
              >
                <Text
                  variant="caption"
                  className={cn(
                    'font-medium',
                    canApplyPercent ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {I18n.t('transactions.editor.split.apply')}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Name suggestions: drop-up above the sum bar / keyboard while typing a name */}
        {focusedNameIndex !== null && nameSuggestions.length > 0 ? (
          <View className="bg-card border-t border-border/20 py-2">
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            >
              {nameSuggestions.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => applyNameSuggestion(name)}
                  className="px-3 py-1.5 rounded-full bg-secondary/60 active:opacity-70"
                >
                  <Text variant="caption">{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Sum status: sticky bar tracked above the keyboard (or the mini numpad) */}
        <View
          className="bg-card border-t border-border/30"
          style={{
            marginBottom: keyboardHeight,
            paddingBottom:
              keyboardHeight > 0 || focusedAmountIndex !== null ? 4 : Math.max(insets.bottom, 12),
          }}
        >
          <View className="px-5 pt-3 pb-2 items-center">
            <View className="flex-row items-center gap-2">
              <Text variant="bodyStrong" className="shrink text-center text-foreground">
                {settlementLine ??
                  (itemized
                    ? I18n.t('transactions.editor.split.itemized_total', {
                        sum: formatMoney(unpaidSum),
                      })
                    : I18n.t('transactions.editor.split.sum_match', {
                        sum: formatMoney(unpaidSum),
                        total: formatMoney(total),
                      }))}
              </Text>
              {sumComplete && !belowPaidBack ? (
                <Check size={16} color={themeColors.success} />
              ) : null}
            </View>
            {sumComplete || belowPaidBack ? null : itemized ? (
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('transactions.editor.split.itemized_total_zero_hint')}
              </Text>
            ) : (
              <Text
                variant="caption"
                className={cn('mt-0.5', diff > 0 ? 'text-success' : 'text-destructive')}
              >
                {diff > 0
                  ? I18n.t('transactions.editor.split.sum_left', { diff: formatMoney(diff) })
                  : I18n.t('transactions.editor.split.sum_over', {
                      diff: formatMoney(Math.abs(diff)),
                    })}
              </Text>
            )}
          </View>
        </View>

        {/* Mini numpad: replaces the OS keyboard for per-row amount entry. */}
        {focusedAmountIndex !== null ? (
          <MiniNumpad
            key={focusedAmountIndex}
            initialExpression={focusedExpression}
            onValueChange={handleNumpadValueChange}
            onConfirm={handleNumpadConfirm}
          />
        ) : null}
      </SafeAreaView>

      {toast ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(160)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            top: insets.top + 64,
            alignItems: 'center',
            zIndex: 50,
          }}
        >
          <View className="max-w-full rounded-2xl bg-destructive px-4 py-2.5 shadow-lg">
            <Text variant="bodyStrong" numberOfLines={2} className="text-center text-white">
              {toast}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      <PaidByPickerSheet
        visible={payerPickerOpen}
        options={payerOptions}
        onClose={() => setPayerPickerOpen(false)}
        onSelect={(rowIndex) => {
          setPayerPickerOpen(false);
          handlePayerChange(rowIndex);
        }}
      />

      <AccountPickerSheet
        visible={accountPickerSplit !== null}
        onClose={() => setAccountPickerForKey(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={
          accountPickerSplit
            ? (splits[accountPickerSplit.index]?.paybackAccountId ?? defaultAccountId ?? null)
            : null
        }
        onSelect={(accountId) => {
          if (!accountPickerSplit) return;
          const { index } = accountPickerSplit;
          const target = splits[index];
          // Stamp the chosen "paid back to" account, then mark the row paid.
          // Both write through the editor's setSplits (a functional update in
          // onMarkPaid composes on top of this value set), so they don't race.
          onChange(splits.map((s, i) => (i === index ? { ...s, paybackAccountId: accountId } : s)));
          if (target?.id) onMarkPaid?.(target.id);
          setAccountPickerForKey(null);
        }}
      />
    </>
  );

  if (presentation === 'page') return body;

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      {body}
    </ThemeModal>
  );
}
