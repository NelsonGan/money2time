import {
  Check,
  ChevronLeft,
  Minus,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  UserRound,
  Users,
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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
import { recentSplitPersonNames } from '~/features/transactions/lib/settleUp';
import {
  applyPercent,
  buildSplitInputs,
  nextEditableAmountIndex,
} from '~/features/transactions/lib/splitMath';
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
  /** Optional item name (auto-filled when splitting a scanned receipt). */
  note?: string | null;
  /** Marked as a shared item — on create its cost divides across the users. */
  shared?: boolean | null;
  paybackAccountId: string | null;
  /** Set once a friend marks paid. paidTransactionId is null for same-account paybacks
   * (no transfer tx is created — the parent expense is just reduced). */
  paid?: { paidAt: string; paidTransactionId: string | null };
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
  /**
   * Receipt "assign items" mode (a scanned split): rows are receipt line items,
   * so an avatar tap claims a row as "mine" and any row (incl. self) is
   * removable. Only enables those interactions — the optional item-name note is
   * shown for every itemized row regardless.
   */
  assignItems?: boolean;
  /** Discard staged edits and close. Wired to the back chevron + system close. */
  onCancel: () => void;
  /** Commit staged edits and close. Wired to the Done button. */
  onDone: () => void;
  /** Current parent expense amount (already reduced by any paid splits). */
  total: number;
  defaultAccountId: string | null;
  splits: SplitDraft[];
  onChange: (splits: SplitDraft[]) => void;
  splitEvenly: boolean;
  onSplitEvenlyChange: (v: boolean) => void;
  /** Receipt-split only: collapse the scanned items into a plain even split. */
  onSplitEvenly?: () => void;
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

// Tax & service percentage stepper bounds (itemized mode). Negative values are
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
 *  Paid rows keep their amount — they're already settled. */
function distributeEvenlyAcrossUnpaid(rows: SplitDraft[], total: number): SplitDraft[] {
  if (rows.length === 0) return rows;
  const unpaidIndices: number[] = [];
  rows.forEach((r, i) => {
    if (!r.paid) unpaidIndices.push(i);
  });
  if (unpaidIndices.length === 0) return rows;
  const portions = distributeEvenly(total, unpaidIndices.length);
  return rows.map((row, idx) => {
    const slot = unpaidIndices.indexOf(idx);
    if (slot < 0) return row;
    return { ...row, amount: (portions[slot] ?? 0).toFixed(2) };
  });
}

/** Mirror of autoBalanceSelf: when the user edits Me, redistribute the
 *  remaining (total - Me) evenly across the unpaid friend rows. Floors at 0
 *  so friends can't go negative if Me eats more than the total. */
function autoBalanceFriends(rows: SplitDraft[], total: number): SplitDraft[] {
  const selfIndex = rows.findIndex((r) => r.isSelf);
  if (selfIndex < 0) return rows;
  const selfAmount = Number(rows[selfIndex]?.amount);
  const safeSelf = Number.isFinite(selfAmount) ? Math.max(0, selfAmount) : 0;

  const unpaidFriendIndices: number[] = [];
  rows.forEach((r, i) => {
    if (i === selfIndex || r.paid) return;
    unpaidFriendIndices.push(i);
  });
  if (unpaidFriendIndices.length === 0) return rows;

  const remaining = Math.max(0, Math.round((total - safeSelf) * 100) / 100);
  const portions = distributeEvenly(remaining, unpaidFriendIndices.length);
  return rows.map((row, i) => {
    const slot = unpaidFriendIndices.indexOf(i);
    if (slot < 0) return row;
    return { ...row, amount: (portions[slot] ?? 0).toFixed(2) };
  });
}

/** Convert the modal's `SplitDraft[]` into the `SplitDraftInput[]` shape that
 *  AppContext mutations expect. Trims names, parses amounts, falls back to the
 *  parent transaction's account when no payback account was picked. */
function toSplitDraftInputs(
  splits: SplitDraft[],
  fallbackAccountId: string | null | undefined,
  sharedNote?: string | null,
): SplitDraftInput[] {
  // Shared rows are expanded (their pool divided across the users) by
  // buildSplitInputs; everything else maps 1:1.
  return buildSplitInputs(splits, fallbackAccountId, sharedNote) as SplitDraftInput[];
}

export const splitsHelpers = {
  distributeEvenly,
  toSplitDraftInputs,
  distributeEvenlyAcrossUnpaid,
  autoBalanceSelf,
};

// Width of each revealed swipe action behind a row.
const SWIPE_ACTION_WIDTH = 88;

/**
 * Wraps a row so it can be swiped left to reveal action buttons — always
 * Delete, plus an optional "Split" (mark the item as shared) for itemized
 * rows. Swipe opens the tray; tap a button to act. Non-swipeable rows render
 * inert. The foreground is opaque so it covers the tray while closed.
 */
function SwipeRowActions({
  enabled,
  onDelete,
  onSplit,
  isShared,
  children,
}: {
  enabled: boolean;
  onDelete: () => void;
  /** When provided, a "Split" action is revealed alongside Delete. */
  onSplit?: () => void;
  isShared?: boolean;
  children: React.ReactNode;
}) {
  const tx = useSharedValue(0);
  const startX = useSharedValue(0);
  const reveal = SWIPE_ACTION_WIDTH * (onSplit ? 2 : 1);

  const close = useCallback(() => {
    tx.value = withTiming(0, { duration: 150 });
  }, [tx]);

  const handleDelete = useCallback(() => {
    void triggerHaptic('warning');
    onDelete();
  }, [onDelete]);

  const handleSplit = useCallback(() => {
    void triggerHaptic('selection');
    close();
    onSplit?.();
  }, [close, onSplit]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        // Only claim the gesture on a clear horizontal drag so the vertical
        // ScrollView and the row's inputs still work.
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onStart(() => {
          startX.value = tx.value;
        })
        .onUpdate((e) => {
          const next = startX.value + e.translationX;
          // Clamp to closed on the right; allow a little rubber-band past open.
          tx.value = Math.max(-reveal - 32, Math.min(0, next));
        })
        .onEnd((e) => {
          const settleOpen = tx.value < -reveal / 2 || e.velocityX < -500;
          tx.value = withTiming(settleOpen ? -reveal : 0, { duration: 150 });
        }),
    [enabled, reveal, startX, tx],
  );

  const foregroundStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  if (!enabled) return <View className="bg-card">{children}</View>;

  return (
    <View className="bg-card">
      <View className="absolute inset-y-0 right-0 flex-row" style={{ width: reveal }}>
        {onSplit ? (
          <Pressable
            onPress={handleSplit}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('transactions.editor.split.button_short')}
            className="flex-row items-center justify-center gap-1.5 bg-primary"
            style={{ width: SWIPE_ACTION_WIDTH }}
          >
            <Users size={16} color="#FFFFFF" />
            <Text variant="caption" className="font-semibold text-white">
              {isShared
                ? I18n.t('transactions.editor.split.shared_label')
                : I18n.t('transactions.editor.split.button_short')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.delete')}
          className="flex-row items-center justify-center gap-1.5 bg-destructive"
          style={{ width: SWIPE_ACTION_WIDTH }}
        >
          <Trash2 size={16} color="#FFFFFF" />
          <Text variant="caption" className="font-semibold text-white">
            {I18n.t('common.delete')}
          </Text>
        </Pressable>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View className="bg-card" style={foregroundStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function SplitBillModal({
  visible,
  presentation = 'modal',
  initialToast,
  itemized = false,
  assignItems = false,
  onCancel,
  onDone,
  total,
  defaultAccountId,
  splits,
  onChange,
  splitEvenly,
  onSplitEvenlyChange,
  onSplitEvenly,
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

  // Receipt "assign items" mode (an explicit flag, not inferred from notes, so a
  // manual item-name note can't accidentally switch it on): lets a row be
  // claimed as "mine" by tapping its avatar and any row removed. The optional
  // item-name note itself shows for every itemized row (manual or receipt).
  const isReceiptSplit = itemized && assignItems;

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
  // Focusing the item-name field uses the OS keyboard just like a friend name —
  // hide the mini numpad (and any name drop-up) so the sticky sum bar tracks the
  // keyboard cleanly instead of stacking the numpad's height under it.
  const handleNoteFocus = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFocusedAmountIndex(null);
    setFocusedNameIndex(null);
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

  // Itemized-mode tax & service adjustment: a single percentage stepper.
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
    onChange(next);
    Keyboard.dismiss();
  }, [onChange, percent, splits]);

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
      // Receipt-split rows are all removable (each is a receipt item); otherwise
      // the single "Me" row must stay.
      if (!target || (target.isSelf && !isReceiptSplit)) return;
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
    [applyEvenSplit, isReceiptSplit, itemized, onChange, splitEvenly, splits, total],
  );

  const handleNameChange = useCallback(
    (index: number, value: string) => {
      onChange(splits.map((row, i) => (i === index ? { ...row, personName: value } : row)));
    },
    [onChange, splits],
  );

  // Item-name note (itemized mode): free text, auto-filled from a scanned receipt.
  const handleNoteChange = useCallback(
    (index: number, value: string) => {
      onChange(splits.map((row, i) => (i === index ? { ...row, note: value } : row)));
    },
    [onChange, splits],
  );

  // Itemized mode: tap a row's avatar to claim the item as "mine" (self) or
  // release it back to a friend. A self row clears its typed name (it shows
  // "Me") and can't be marked paid; toggling off restores an editable name.
  const handleToggleSelf = useCallback(
    (index: number) => {
      const target = splits[index];
      if (!target || target.paid) return;
      void triggerHaptic('selection');
      onChange(
        splits.map((row, i) =>
          i === index
            ? {
                ...row,
                isSelf: !row.isSelf,
                // Claiming an item as mine clears any "shared" mark (mutually
                // exclusive); releasing it leaves shared untouched.
                shared: row.isSelf ? row.shared : false,
                personName: row.isSelf ? row.personName : '',
              }
            : row,
        ),
      );
    },
    [onChange, splits],
  );

  // Mark an item as shared (or un-mark it). A shared item is greyed out here and
  // its cost is divided across the users on create (see buildSplitInputs). A
  // shared row can't also be claimed as "mine", so clear self when marking.
  const handleToggleShared = useCallback(
    (index: number) => {
      const target = splits[index];
      if (!target || target.paid) return;
      onChange(
        splits.map((row, i) =>
          i === index
            ? { ...row, shared: !row.shared, isSelf: row.shared ? row.isSelf : false }
            : row,
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
  const canDone = itemized ? unpaidSum > 0.004 : sumMatches;
  // Whether the sum bar shows its "all good" state (drives the check + hint).
  const sumComplete = itemized ? canDone : sumMatches;

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
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Total + status footer card. Itemized shows the live subtotal and a
              hint (no fixed total, no split-evenly toggle); otherwise the fixed
              total and the split-evenly switch. Shared card shell + top row. */}
          <View className="mx-4 mt-4 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            <View className="px-4 py-3 flex-row items-center justify-between">
              <Text variant="caption" tone="muted">
                {I18n.t(
                  itemized
                    ? 'transactions.editor.split.subtotal_label'
                    : 'transactions.editor.amount',
                )}
              </Text>
              <Text variant="bodyStrong">{formatMoney(itemized ? unpaidSum : total)}</Text>
            </View>
            <View className="h-[1px] bg-border/15 mx-4" />
            {itemized ? (
              <View className="px-4 py-3 flex-row items-center justify-between gap-2">
                <View className="flex-1 min-w-0 flex-row items-center gap-2">
                  <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                    <UserRound size={13} color={themeColors.textMuted} />
                  </View>
                  <Text variant="caption" tone="muted" className="shrink">
                    {I18n.t(
                      isReceiptSplit
                        ? 'transactions.editor.split.receipt_split_hint'
                        : 'transactions.editor.split.itemized_header_hint',
                    )}
                  </Text>
                </View>
                {isReceiptSplit && onSplitEvenly ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      onSplitEvenly();
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5"
                  >
                    <Text variant="caption" className="font-medium text-primary">
                      {I18n.t('transactions.editor.split.even_toggle')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="px-4 py-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                    <UserRound size={13} color={themeColors.textMuted} />
                  </View>
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.editor.split.even_toggle')}
                  </Text>
                </View>
                <Switch
                  value={splitEvenly}
                  onValueChange={handleToggleEven}
                  trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}
          </View>

          {/* Person rows card */}
          <View className="mx-4 mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            {splits.map((row, index) => {
              const acct = row.paybackAccountId ? accountById.get(row.paybackAccountId) : null;
              const fallbackAcct = defaultAccountId ? accountById.get(defaultAccountId) : null;
              const effectiveAcct = acct ?? fallbackAcct ?? null;
              const acctLabel = effectiveAcct?.name ?? I18n.t('common.no_account');
              const disabledRow = !!row.paid;
              const canMarkPaid = !row.isSelf && !!row.id && !disabledRow && !!onMarkPaid;
              const canUndo = disabledRow && !!row.id && !!onMarkUnpaid && newlyPaidIds.has(row.id);
              const rowKey = row.id ?? `new_${index}`;
              // Friends are always removable; the single "Me" row stays unless
              // this is a receipt split (where every row is a receipt item).
              // Paid rows are settled — they don't expose a delete affordance.
              const removable = (!row.isSelf || isReceiptSplit) && !disabledRow;
              const isSharedRow = !!row.shared;
              // "Split" (share) applies to scanned receipt items — each row is a
              // real line item that can be shared across everyone.
              const canMarkShared = isReceiptSplit && !disabledRow;
              return (
                <SwipeRowActions
                  key={rowKey}
                  enabled={removable || canMarkShared}
                  onDelete={() => handleRemove(index)}
                  onSplit={canMarkShared ? () => handleToggleShared(index) : undefined}
                  isShared={isSharedRow}
                >
                  {index > 0 ? <View className="h-[1px] bg-border/15 mx-4" /> : null}
                  <View className="px-4 py-3" style={isSharedRow ? { opacity: 0.45 } : undefined}>
                    <View className="flex-row items-center gap-3">
                      <Pressable
                        // Receipt split: tap to claim/release the item as "mine".
                        onPress={
                          isReceiptSplit && !disabledRow ? () => handleToggleSelf(index) : undefined
                        }
                        disabled={!isReceiptSplit || disabledRow}
                        className={cn(
                          'h-9 w-9 rounded-full items-center justify-center',
                          row.isSelf
                            ? 'bg-primary/15'
                            : disabledRow
                              ? 'bg-success/15'
                              : 'bg-secondary/60',
                          isReceiptSplit && !disabledRow && !row.isSelf
                            ? 'border border-dashed border-border'
                            : '',
                        )}
                      >
                        {disabledRow ? (
                          <Check size={14} color={themeColors.success} />
                        ) : row.isSelf ? (
                          <Text variant="caption" className="font-semibold text-primary">
                            {I18n.t('transactions.editor.split.me_label').slice(0, 1).toUpperCase()}
                          </Text>
                        ) : (
                          // A static icon (not the typed name's initial) — recomputing the
                          // initial on every keystroke re-rendered the row and caused input
                          // lag. Other screens (Settle Up) still show the name initial.
                          <UserRound size={15} color={themeColors.textMuted} />
                        )}
                      </Pressable>

                      {/* Name + optional item name stacked in one column so the
                          row stays tidy and the amount pill hugs the right. */}
                      <View className="flex-1 min-w-0">
                        <TextInput
                          value={
                            row.isSelf
                              ? I18n.t('transactions.editor.split.me_label')
                              : row.personName
                          }
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
                            {
                              color: disabledRow ? themeColors.textMuted : themeColors.text,
                              fontSize: 15,
                            },
                          ]}
                        />
                        {/* Item name: an optional note under any itemized row
                            (auto-filled from a scanned receipt; free to type on a
                            manual itemized split). */}
                        {itemized ? (
                          <View className="flex-row items-center gap-1.5 mt-0.5">
                            <Tag size={12} color={themeColors.textMuted} />
                            <TextInput
                              value={row.note ?? ''}
                              editable={!disabledRow}
                              onFocus={handleNoteFocus}
                              onChangeText={(text) => handleNoteChange(index, text)}
                              placeholder={I18n.t(
                                'transactions.editor.split.item_name_placeholder',
                              )}
                              placeholderTextColor={`${themeColors.mutedForeground}99`}
                              style={[
                                SINGLE_LINE_TEXT_INPUT_STYLE,
                                styles.nameInput,
                                { color: themeColors.textMuted, fontSize: 13 },
                              ]}
                            />
                          </View>
                        ) : null}
                      </View>

                      {isSharedRow ? (
                        <View className="shrink-0 flex-row items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5">
                          <Users size={11} color={themeColors.primary} />
                          <Text variant="caption" className="font-medium text-primary">
                            {I18n.t('transactions.editor.split.shared_label')}
                          </Text>
                        </View>
                      ) : null}

                      {/* Amount pill */}
                      <Pressable
                        onPress={() => handleAmountFocus(index)}
                        disabled={disabledRow}
                        className={cn(
                          'flex-row items-center gap-0.5 rounded-xl px-3 py-2 min-w-[80px] justify-end',
                          focusedAmountIndex === index
                            ? 'border border-primary/45 bg-primary/10'
                            : 'bg-secondary/40',
                        )}
                      >
                        <Text variant="caption" tone="muted">
                          {currencySymbol}
                        </Text>
                        <Text
                          style={{
                            color: disabledRow ? themeColors.textMuted : themeColors.text,
                            fontSize: 15,
                          }}
                        >
                          {focusedAmountIndex === index
                            ? focusedExpression || '0'
                            : row.amount || '0'}
                        </Text>
                      </Pressable>
                    </View>

                    {/* Secondary line: paid status, or payback + mark-paid for an
                        unpaid friend. Delete now lives on the row swipe, so this
                        line stays uncluttered and aligned under the name. Shared
                        items have no single assignee, so they skip it. */}
                    {isSharedRow ? null : !row.isSelf ? (
                      disabledRow ? (
                        <View className="flex-row items-center justify-between mt-2 pl-12 gap-2">
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
                      ) : (
                        <View className="flex-row items-center mt-2 pl-12 gap-2">
                          <Pressable
                            onPress={() => {
                              void triggerHaptic('selection');
                              setAccountPickerForKey(rowKey);
                            }}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                            className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 flex-shrink min-w-0"
                          >
                            <Text variant="caption" tone="muted">
                              {I18n.t('transactions.editor.split.payback_to')}:
                            </Text>
                            {effectiveAcct ? (
                              <AccountLogo
                                logoId={effectiveAcct.logoId}
                                type={effectiveAcct.type}
                                size={16}
                              />
                            ) : null}
                            <Text variant="caption" numberOfLines={1} className="max-w-[110px]">
                              {acctLabel}
                            </Text>
                          </Pressable>

                          <View className="flex-1" />

                          {canMarkPaid ? (
                            <Pressable
                              onPress={() => {
                                void triggerHaptic('success');
                                onMarkPaid?.(row.id ?? '');
                              }}
                              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                              className="px-3 py-1.5 rounded-full bg-success/15"
                            >
                              <Text variant="caption" className="text-success font-medium">
                                {I18n.t('transactions.editor.split.mark_paid')}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      )
                    ) : isReceiptSplit && !disabledRow ? (
                      <View className="flex-row items-center mt-2 pl-12 gap-1.5">
                        <Text variant="caption" tone="muted">
                          {I18n.t('transactions.editor.split.mine_hint')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </SwipeRowActions>
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

          {/* Tax & service (itemized only): a percentage stepper applied
              proportionally on top of the entered amounts. */}
          {itemized ? (
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
          ) : null}
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
              <Text variant="bodyStrong" className="text-foreground">
                {itemized
                  ? I18n.t('transactions.editor.split.itemized_total', {
                      sum: formatMoney(unpaidSum),
                    })
                  : I18n.t('transactions.editor.split.sum_match', {
                      sum: formatMoney(unpaidSum),
                      total: formatMoney(total),
                    })}
              </Text>
              {sumComplete ? <Check size={16} color={themeColors.success} /> : null}
            </View>
            {sumComplete ? null : itemized ? (
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

      <AccountPickerSheet
        visible={accountPickerSplit !== null}
        onClose={() => setAccountPickerForKey(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={
          accountPickerSplit ? (splits[accountPickerSplit.index]?.paybackAccountId ?? null) : null
        }
        onSelect={(accountId) => {
          if (!accountPickerSplit) return;
          const { index } = accountPickerSplit;
          const next = splits.map((s, i) =>
            i === index ? { ...s, paybackAccountId: accountId } : s,
          );
          onChange(next);
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
