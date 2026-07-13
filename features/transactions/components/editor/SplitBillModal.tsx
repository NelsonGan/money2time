import {
  Check,
  ChevronLeft,
  FileText,
  Minus,
  Plus,
  RotateCcw,
  Scale,
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

import {
  AccountLogo,
  AccountPickerSheet,
  SegmentedToggle,
  Text,
  ThemeModal,
} from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { type SplitDraftInput, useTransactions } from '~/context/AppContext';
import {
  evaluateExpression,
  formatMoney as formatCalcAmount,
  sanitizeInitialAmount,
} from '~/features/transactions/components/editor/calculatorEngine';
import { MiniNumpad } from '~/features/transactions/components/editor/MiniNumpad';
import { recentSplitPersonNames, sharedItemNote } from '~/features/transactions/lib/settleUp';
import {
  applyPercent,
  buildSplitInputs,
  nextEditableAmountIndex,
} from '~/features/transactions/lib/splitMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup, SplitMethod } from '~/types';
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
  /** How the bill divides — chosen on the page, switchable at any time. */
  method: SplitMethod;
  /** Switch the split method (Evenly / Custom / Items). */
  onMethodChange: (method: SplitMethod) => void;
  /** Set the split total (writes back to the parent expense amount). */
  onTotalChange: (total: number) => void;
  /**
   * Receipt "assign items" mode (a scanned split): rows are receipt line items,
   * so an avatar tap claims a row as "mine" and any row (incl. self) is
   * removable. Only enables those interactions — the optional item-name note is
   * shown for every Items-method row regardless.
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
/** Note stored on each user's shared line: "(Shared) Wine, Bread", or just
 *  "(Shared)" when the shared items had no names. The "(Shared)" prefix is
 *  parsed back out and shown as a badge on the receipt. */
function defaultSharedNote(itemNames: string[]): string {
  return sharedItemNote(I18n.t('transactions.editor.split.shared_label'), itemNames);
}

/** Stable placeholder name for an unnamed friend: "Person A", "Person B", …
 *  (letters, then numbers past Z). Reused for their own + shared lines so they
 *  group on the receipt. */
function defaultAnonName(index: number): string {
  const label = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
  return I18n.t('transactions.editor.split.anon_person', { label });
}

function toSplitDraftInputs(
  splits: SplitDraft[],
  fallbackAccountId: string | null | undefined,
  formatSharedNote: (itemNames: string[]) => string | null = defaultSharedNote,
): SplitDraftInput[] {
  // Shared rows are expanded (their pool divided across the users) by
  // buildSplitInputs; everything else maps 1:1.
  return buildSplitInputs(
    splits,
    fallbackAccountId,
    formatSharedNote,
    defaultAnonName,
  ) as SplitDraftInput[];
}

export const splitsHelpers = {
  distributeEvenly,
  toSplitDraftInputs,
  distributeEvenlyAcrossUnpaid,
  autoBalanceSelf,
};

// Width of each revealed swipe action behind a row.
const SWIPE_ACTION_WIDTH = 88;

// Top-level split mode. "By person" covers the Evenly/Custom methods (Evenly is
// a toggle on that page); "By item" is the itemized/receipt method.
type SplitMode = 'person' | 'item';

/**
 * Wraps a row so it can be swiped left to reveal action buttons — an optional
 * "Split" (mark the item as shared) and/or Delete, depending on which handlers
 * are provided. Swipe opens the tray; tap a button to act. Rows with no actions
 * render inert. The foreground is opaque so it covers the tray while closed.
 */
function SwipeRowActions({
  onDelete,
  onSplit,
  isShared,
  children,
}: {
  /** When provided, a Delete action is revealed. */
  onDelete?: () => void;
  /** When provided, a "Split" action is revealed. */
  onSplit?: () => void;
  isShared?: boolean;
  children: React.ReactNode;
}) {
  const tx = useSharedValue(0);
  const startX = useSharedValue(0);
  const actionCount = (onSplit ? 1 : 0) + (onDelete ? 1 : 0);
  const reveal = SWIPE_ACTION_WIDTH * actionCount;
  const enabled = actionCount > 0;

  const close = useCallback(() => {
    tx.value = withTiming(0, { duration: 150 });
  }, [tx]);

  const handleDelete = useCallback(() => {
    void triggerHaptic('warning');
    onDelete?.();
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
        {onDelete ? (
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
        ) : null}
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
  method,
  onMethodChange,
  onTotalChange,
  assignItems = false,
  onCancel,
  onDone,
  total,
  defaultAccountId,
  splits,
  onChange,
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
  // The split method is the single source of truth for the page's behavior.
  // `items` is the itemized/receipt world (rows are named items, total = sum);
  // `even` divides the total equally; `custom` is per-person amounts. These two
  // booleans let the rest of the component keep its original branch names.
  const itemized = method === 'items';
  const splitEvenly = method === 'even';
  // Top-level mode shown in the selector; "By person" holds the Evenly toggle.
  const mode: SplitMode = itemized ? 'item' : 'person';
  // Remember whether the person page was on Evenly or Custom so returning to it
  // from "By item" restores that choice rather than always snapping to Evenly.
  const prevPersonMethodRef = useRef<SplitMethod>(method === 'items' ? 'even' : method);
  if (method !== 'items') prevPersonMethodRef.current = method;
  const [accountPickerForKey, setAccountPickerForKey] = useState<string | null>(null);
  // The mini numpad can target a row's amount OR the split total; this flags the
  // latter so the numpad's value/confirm route to onTotalChange instead.
  const [totalFocused, setTotalFocused] = useState(false);
  // The name/item-name fields are uncontrolled (driven by defaultValue) so a
  // controlled `value` that round-trips through the editor's state doesn't lag
  // behind fast typing and drop/flash characters. When a row's text is set
  // programmatically (name suggestion, claim-as-mine, share), bump this nonce to
  // remount the inputs so they pick up the new defaultValue. Typing never bumps it.
  const [textFieldNonce, setTextFieldNonce] = useState(0);
  const bumpTextFields = useCallback(() => setTextFieldNonce((n) => n + 1), []);

  // ─── Debounced text commit ───────────────────────────────────────────────
  // Name / item-name typing commits to the editor's split state on a short
  // debounce instead of on every keystroke. Each commit round-trips through the
  // editor (setSplits → re-publish session → this modal re-renders), so pushing
  // one per keystroke re-renders the whole editor tree and janks fast typing.
  // The inputs stay uncontrolled (defaultValue), so the on-screen text is never
  // clobbered by the trailing commit. Refs hold the latest props so the timer
  // and the mutation helpers below never read a stale closure.
  const splitsRef = useRef(splits);
  splitsRef.current = splits;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingTextRef = useRef<Map<string, { personName?: string; note?: string }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  // Latest splits with any un-committed name / item-name edits folded in — the
  // base every mutation builds on so a pending keystroke is never dropped.
  const currentRows = useCallback((): SplitDraft[] => {
    const pending = pendingTextRef.current;
    if (pending.size === 0) return splitsRef.current;
    return splitsRef.current.map((row, i) => {
      const edit = pending.get(row.id ?? `new_${i}`);
      if (!edit) return row;
      return {
        ...row,
        ...(edit.personName !== undefined ? { personName: edit.personName } : null),
        ...(edit.note !== undefined ? { note: edit.note } : null),
      };
    });
  }, []);

  // Commit an already-computed next state, dropping the pending text buffer (the
  // caller derived `next` from currentRows(), so those edits are already in it).
  const commitRows = useCallback(
    (next: SplitDraft[]) => {
      clearFlushTimer();
      pendingTextRef.current.clear();
      onChangeRef.current(next);
    },
    [clearFlushTimer],
  );

  // Commit pending text now (on blur / Done). No-op when nothing is pending.
  const flushPendingText = useCallback(() => {
    clearFlushTimer();
    if (pendingTextRef.current.size === 0) return;
    const rows = currentRows();
    pendingTextRef.current.clear();
    onChangeRef.current(rows);
  }, [clearFlushTimer, currentRows]);

  // Drop pending text without committing (on Cancel — the editor restores its
  // pre-open snapshot, so the un-committed keystrokes are meant to be discarded).
  const discardPendingText = useCallback(() => {
    clearFlushTimer();
    pendingTextRef.current.clear();
  }, [clearFlushTimer]);

  const scheduleTextFlush = useCallback(() => {
    clearFlushTimer();
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushPendingText();
    }, 250);
  }, [clearFlushTimer, flushPendingText]);

  const queueTextEdit = useCallback(
    (index: number, field: 'personName' | 'note', value: string) => {
      const row = splitsRef.current[index];
      if (!row) return;
      const key = row.id ?? `new_${index}`;
      const entry = pendingTextRef.current.get(key) ?? {};
      entry[field] = value;
      pendingTextRef.current.set(key, entry);
      scheduleTextFlush();
    },
    [scheduleTextFlush],
  );

  useEffect(() => () => clearFlushTimer(), [clearFlushTimer]);

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
    setTotalFocused(false);
    setFocusedAmountIndex(null);
    setFocusedNameIndex(index);
  }, []);
  const handleNameBlur = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    // Leaving the field commits the typed name immediately (the debounce is only
    // there to keep fast typing smooth).
    flushPendingText();
    // Delay clearing so a tap on a suggestion chip lands before the bar unmounts.
    blurTimer.current = setTimeout(() => setFocusedNameIndex(null), 120);
  }, [flushPendingText]);
  // Focusing the item-name field uses the OS keyboard just like a friend name —
  // hide the mini numpad (and any name drop-up) so the sticky sum bar tracks the
  // keyboard cleanly instead of stacking the numpad's height under it.
  const handleNoteFocus = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setTotalFocused(false);
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
      setTotalFocused(false);
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
      commitRows(
        currentRows().map((row, i) =>
          i === focusedNameIndex ? { ...row, personName: name } : row,
        ),
      );
      bumpTextFields();
    },
    [bumpTextFields, commitRows, currentRows, focusedNameIndex],
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
      // Auto-balance (Me absorbs the remainder / friends re-divide) only makes
      // sense against a fixed total. In Items — or a Custom split with no total
      // set yet — the rows are free-form and the total is just their sum.
      if (itemized || !(total > 0)) return next;
      return target.isSelf ? autoBalanceFriends(next, total) : autoBalanceSelf(next, total, index);
    },
    [itemized, total],
  );

  // The total as it should read RIGHT NOW: while the total field is being typed,
  // use the live numpad expression instead of the committed `total` prop, which
  // lags a frame behind (onTotalChange → editor setAmount → re-publish).
  const liveTotal = useMemo(() => {
    if (!totalFocused) return total;
    const v = evaluateExpression(focusedExpression);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  }, [totalFocused, focusedExpression, total]);

  // Rows as they should DISPLAY right now. Editing round-trips through the editor
  // (setSplits / setAmount → re-publish), so reading the committed props directly
  // lags a frame behind the keystroke — which made the sum bar + Done button
  // flicker on every digit. Mirror the editor's rebalance against the LIVE value
  // so the display stays in lockstep with what's typed; the background commit
  // still persists it (and is idempotent with this view, so no visible jump).
  const liveSplits = useMemo(() => {
    // Typing the total: rebalance to the live total the same way the editor's
    // amount-sync effect will (Even redistributes, Custom lets Me absorb).
    if (totalFocused) {
      if (splitEvenly) return distributeEvenlyAcrossUnpaid(splits, liveTotal);
      if (!itemized && liveTotal > 0) return autoBalanceSelf(splits, liveTotal);
      return splits;
    }
    // Typing a row amount: overlay that row's live expression + auto-balanced Me.
    if (focusedAmountIndex === null) return splits;
    const value = formatCalcAmount(evaluateExpression(focusedExpression));
    return computeAmountUpdate(splits, focusedAmountIndex, value) ?? splits;
  }, [
    splits,
    totalFocused,
    liveTotal,
    splitEvenly,
    itemized,
    focusedAmountIndex,
    focusedExpression,
    computeAmountUpdate,
  ]);

  // Sum of UNPAID splits (Me + outstanding friends). Paid splits are settled
  // and have already reduced the parent amount.
  const unpaidSum = useMemo(() => {
    let s = 0;
    liveSplits.forEach((sp) => {
      if (sp.paid) return;
      const v = Number(sp.amount);
      if (Number.isFinite(v)) s += v;
    });
    return Math.round(s * 100) / 100;
  }, [liveSplits]);

  const diff = useMemo(
    () => Math.round((liveTotal - unpaidSum) * 100) / 100,
    [liveTotal, unpaidSum],
  );

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
    const next = applyPercent(currentRows(), percent);
    if (!next) return;
    void triggerHaptic('success');
    commitRows(next);
    Keyboard.dismiss();
  }, [commitRows, currentRows, percent]);

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

  // Switch the split method on the page. Evenly needs a total to divide, so it
  // adopts the current row sum as the total when none is set yet (coming from
  // Items or an empty Custom); Custom/Items just keep the current amounts.
  const handleMethodChange = useCallback(
    (next: SplitMethod) => {
      if (next === method) return;
      void triggerHaptic('selection');
      const base = currentRows();
      if (next === 'even') {
        const evenTotal = total > 0 ? total : unpaidSum;
        if (total <= 0 && evenTotal > 0) onTotalChange(evenTotal);
        commitRows(distributeEvenlyAcrossUnpaid(base, evenTotal));
      } else {
        commitRows(base);
      }
      onMethodChange(next);
    },
    [method, currentRows, total, unpaidSum, onTotalChange, commitRows, onMethodChange],
  );

  // Top-level mode: "By item" is the itemized method; "By person" restores the
  // last Evenly/Custom choice made on that page.
  const handleModeChange = useCallback(
    (next: SplitMode) => {
      handleMethodChange(next === 'item' ? 'items' : prevPersonMethodRef.current);
    },
    [handleMethodChange],
  );

  // The "Split evenly" toggle on the By person page flips between the Evenly and
  // Custom methods.
  const handleEvenlyToggle = useCallback(
    (on: boolean) => {
      handleMethodChange(on ? 'even' : 'custom');
    },
    [handleMethodChange],
  );

  const handleAddPerson = useCallback(() => {
    void triggerHaptic('selection');
    const next: SplitDraft[] = [
      ...currentRows(),
      {
        id: newId(),
        personName: '',
        amount: '0',
        isSelf: false,
        paybackAccountId: defaultAccountId,
      },
    ];
    if (splitEvenly) {
      commitRows(applyEvenSplit(next));
      return;
    }
    // Items, or Custom with no total → free-form; otherwise Me absorbs the delta.
    commitRows(itemized || !(total > 0) ? next : autoBalanceSelf(next, total));
  }, [applyEvenSplit, commitRows, currentRows, defaultAccountId, itemized, splitEvenly, total]);

  const handleRemove = useCallback(
    (index: number) => {
      void triggerHaptic('warning');
      const base = currentRows();
      const target = base[index];
      // Receipt-split rows are all removable (each is a receipt item); otherwise
      // the single "Me" row must stay.
      if (!target || (target.isSelf && !isReceiptSplit)) return;
      // Removing a paid row drops the local entry but leaves the linked
      // transfer + parent's reduced amount alone — the user can clean up the
      // transfer separately from the activity list if they want.
      const next = base.filter((_, i) => i !== index);
      if (splitEvenly) {
        commitRows(applyEvenSplit(next));
        return;
      }
      // Items, or Custom with no total → free-form; otherwise Me absorbs the delta.
      commitRows(itemized || !(total > 0) ? next : autoBalanceSelf(next, total));
    },
    [applyEvenSplit, commitRows, currentRows, isReceiptSplit, itemized, splitEvenly, total],
  );

  const handleNameChange = useCallback(
    (index: number, value: string) => queueTextEdit(index, 'personName', value),
    [queueTextEdit],
  );

  // Item-name note (itemized mode): free text, auto-filled from a scanned receipt.
  const handleNoteChange = useCallback(
    (index: number, value: string) => queueTextEdit(index, 'note', value),
    [queueTextEdit],
  );

  // Itemized mode: tap a row's avatar to claim the item as "mine" (self) or
  // release it back to a friend. A self row clears its typed name (it shows
  // "Me") and can't be marked paid; toggling off restores an editable name.
  const handleToggleSelf = useCallback(
    (index: number) => {
      const base = currentRows();
      const target = base[index];
      if (!target || target.paid) return;
      void triggerHaptic('selection');
      commitRows(
        base.map((row, i) =>
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
      bumpTextFields();
    },
    [bumpTextFields, commitRows, currentRows],
  );

  // Mark an item as shared (or un-mark it). A shared item is greyed out here and
  // its cost is divided across the users on create (see buildSplitInputs). A
  // shared row can't also be claimed as "mine", so clear self when marking.
  const handleToggleShared = useCallback(
    (index: number) => {
      const base = currentRows();
      const target = base[index];
      if (!target || target.paid) return;
      commitRows(
        base.map((row, i) =>
          i === index
            ? { ...row, shared: !row.shared, isSelf: row.shared ? row.isSelf : false }
            : row,
        ),
      );
      bumpTextFields();
    },
    [bumpTextFields, commitRows, currentRows],
  );

  const handleAmountChange = useCallback(
    (index: number, value: string) => {
      const updated = computeAmountUpdate(currentRows(), index, value);
      if (!updated) return;
      // Overriding one share turns an even split into a custom one.
      if (splitEvenly) onMethodChange('custom');
      commitRows(updated);
    },
    [commitRows, computeAmountUpdate, currentRows, onMethodChange, splitEvenly],
  );

  // Open the mini numpad on a row's amount: dismiss the OS keyboard (used by
  // name fields), hide the name drop-up, and seed the pad from the row value.
  const handleAmountFocus = useCallback(
    (index: number) => {
      const target = splits[index];
      if (!target || target.paid) return;
      void triggerHaptic('selection');
      Keyboard.dismiss();
      setTotalFocused(false);
      setFocusedNameIndex(null);
      setFocusedAmountIndex(index);
      setFocusedExpression(sanitizeInitialAmount(target.amount));
    },
    [splits],
  );

  // Open the mini numpad on the split total (Evenly/Custom only — Items derives
  // the total from the rows, so its total field is read-only).
  const handleTotalFocus = useCallback(() => {
    if (itemized) return;
    void triggerHaptic('selection');
    Keyboard.dismiss();
    flushPendingText();
    setFocusedNameIndex(null);
    setFocusedAmountIndex(null);
    setTotalFocused(true);
    setFocusedExpression(sanitizeInitialAmount(total > 0 ? total.toFixed(2) : ''));
  }, [itemized, flushPendingText, total]);

  // Each keystroke: keep the live expression for display and push the evaluated
  // value through the total or the focused row's amount path.
  const handleNumpadValueChange = useCallback(
    (expression: string) => {
      setFocusedExpression(expression);
      if (totalFocused) {
        onTotalChange(evaluateExpression(expression));
        return;
      }
      if (focusedAmountIndex === null) return;
      handleAmountChange(focusedAmountIndex, formatCalcAmount(evaluateExpression(expression)));
    },
    [totalFocused, onTotalChange, focusedAmountIndex, handleAmountChange],
  );

  // Done: finalize the target, then (for a row) advance to the next editable row
  // keeping the pad open, or close it when there is none left.
  const handleNumpadConfirm = useCallback(() => {
    if (totalFocused) {
      onTotalChange(evaluateExpression(focusedExpression));
      setTotalFocused(false);
      setFocusedExpression('');
      return;
    }
    if (focusedAmountIndex === null) return;
    const finalValue = formatCalcAmount(evaluateExpression(focusedExpression));
    // Commit and seed the next row from the SAME resulting array — deriving the
    // next seed from the `splits` closure would miss this commit's rebalance.
    const base = currentRows();
    const committed = computeAmountUpdate(base, focusedAmountIndex, finalValue) ?? base;
    if (splitEvenly) onMethodChange('custom');
    commitRows(committed);
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
    commitRows,
    computeAmountUpdate,
    currentRows,
    focusedAmountIndex,
    focusedExpression,
    onMethodChange,
    onTotalChange,
    splitEvenly,
    totalFocused,
  ]);

  const sumMatches = Math.abs(diff) < 0.005;
  // A fixed target exists only when the user has set a total on a non-Items
  // method. Then Done requires the rows to add up to it; otherwise (Items, or a
  // Custom split with no total yet) the rows ARE the total and Done just needs
  // something to commit — the editor derives the parent amount from them.
  const hasFixedTotal = !itemized && liveTotal > 0;
  const canDone = hasFixedTotal ? sumMatches : unpaidSum > 0.004;
  // Whether the sum bar shows its "all good" state (drives the check + hint).
  const sumComplete = canDone;

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
    // Cancel discards edits back to the editor's snapshot, so drop the pending
    // text buffer too instead of flushing it.
    discardPendingText();
    Keyboard.dismiss();
    onCancel();
  }, [discardPendingText, onCancel]);
  const handleDone = useCallback(() => {
    // Commit the last few keystrokes the debounce hasn't flushed yet.
    flushPendingText();
    void triggerHaptic('success');
    Keyboard.dismiss();
    onDone();
  }, [flushPendingText, onDone]);

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
          {/* Mode selector — the one top-level choice: split By person (with an
              Evenly toggle) or By item. Everything else follows from it. */}
          <View className="mx-4 mt-4">
            <SegmentedToggle
              value={mode}
              onChange={handleModeChange}
              options={[
                { value: 'person', label: I18n.t('transactions.editor.split.mode_by_person') },
                { value: 'item', label: I18n.t('transactions.editor.split.mode_by_item') },
              ]}
            />
          </View>

          {/* Total + (By person) the Split-evenly toggle. The total is editable
              By person; By item derives it from the rows, so it reads out the
              live subtotal. */}
          <View className="mx-4 mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            <View className="px-4 py-3.5 flex-row items-center justify-between gap-2">
              <Text variant="caption" tone="muted" className="uppercase tracking-wide">
                {I18n.t(
                  itemized
                    ? 'transactions.editor.split.subtotal_label'
                    : 'transactions.editor.split.total_label',
                )}
              </Text>
              {itemized ? (
                <Text variant="bodyStrong" className="text-base">
                  {formatMoney(unpaidSum)}
                </Text>
              ) : (
                <Pressable
                  onPress={handleTotalFocus}
                  className={cn(
                    'flex-row items-center gap-0.5 rounded-xl px-3 py-2 min-w-[96px] justify-end',
                    totalFocused ? 'border border-primary/45 bg-primary/10' : 'bg-secondary/40',
                  )}
                >
                  <Text variant="caption" tone="muted">
                    {currencySymbol}
                  </Text>
                  <Text style={{ color: themeColors.text, fontSize: 16 }}>
                    {totalFocused ? focusedExpression || '0' : total > 0 ? total.toFixed(2) : '0'}
                  </Text>
                </Pressable>
              )}
            </View>
            {itemized ? null : (
              <>
                <View className="h-[1px] bg-border/15 mx-4" />
                <View className="px-4 py-2.5 flex-row items-center justify-between gap-2">
                  <View className="flex-row items-center gap-2.5">
                    <View className="w-8 h-8 rounded-full bg-secondary/60 items-center justify-center">
                      <Scale size={15} color={themeColors.textMuted} />
                    </View>
                    <View>
                      <Text variant="body" className="font-medium">
                        {I18n.t('transactions.editor.split.even_toggle')}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {I18n.t('transactions.editor.split.even_toggle_hint')}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={splitEvenly}
                    onValueChange={handleEvenlyToggle}
                    trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </>
            )}
          </View>

          {/* Person / item rows card. Rendered from the live view so the
              auto-balanced Me updates in lockstep with the row being typed. */}
          <View className="mx-4 mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            {liveSplits.map((row, index) => {
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
              // "Split" (share) applies to any itemized row — receipt scans and
              // manual itemized splits alike — so its cost can be shared across
              // everyone. Delete only shows for removable rows (the lone "Me"
              // row on a manual split stays but can still be shared).
              const canMarkShared = itemized && !disabledRow;
              return (
                <SwipeRowActions
                  key={rowKey}
                  onDelete={removable ? () => handleRemove(index) : undefined}
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
                          // Uncontrolled (defaultValue) + remount key so fast
                          // typing isn't clobbered by a lagging controlled value.
                          key={`name-${rowKey}-${textFieldNonce}`}
                          defaultValue={
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
                        {/* Item name: an optional note under any Items-method row
                            (auto-filled from a scanned receipt; free to type on a
                            manual split). Mirrors the transaction editor's Note
                            field — a document icon with an "optional" placeholder. */}
                        {itemized ? (
                          <View className="flex-row items-center gap-1.5 mt-0.5">
                            <FileText size={12} color={themeColors.textMuted} />
                            <TextInput
                              // Uncontrolled + remount key (see the name field).
                              key={`note-${rowKey}-${textFieldNonce}`}
                              defaultValue={row.note ?? ''}
                              editable={!disabledRow}
                              onFocus={handleNoteFocus}
                              onBlur={flushPendingText}
                              onChangeText={(text) => handleNoteChange(index, text)}
                              placeholder={I18n.t('transactions.editor.optional')}
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
                                // Commit any in-flight name/note edit first: mark
                                // paid/undo write the editor's splits outside this
                                // modal's commit path.
                                flushPendingText();
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
                                // Commit any in-flight name/note edit first (see undo).
                                flushPendingText();
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
                {I18n.t(
                  itemized
                    ? 'transactions.editor.split.add_item'
                    : 'transactions.editor.split.add_person',
                )}
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
              keyboardHeight > 0 || focusedAmountIndex !== null || totalFocused
                ? 4
                : Math.max(insets.bottom, 12),
          }}
        >
          <View className="px-5 pt-3 pb-2 items-center">
            <View className="flex-row items-center gap-2">
              <Text variant="bodyStrong" className="text-foreground">
                {!hasFixedTotal
                  ? I18n.t('transactions.editor.split.itemized_total', {
                      sum: formatMoney(unpaidSum),
                    })
                  : I18n.t('transactions.editor.split.sum_match', {
                      sum: formatMoney(unpaidSum),
                      total: formatMoney(liveTotal),
                    })}
              </Text>
              {sumComplete ? <Check size={16} color={themeColors.success} /> : null}
            </View>
            {sumComplete ? null : !hasFixedTotal ? (
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

        {/* Mini numpad: replaces the OS keyboard for the total + per-row amounts. */}
        {focusedAmountIndex !== null || totalFocused ? (
          <MiniNumpad
            key={totalFocused ? 'total' : focusedAmountIndex}
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
          const next = currentRows().map((s, i) =>
            i === index ? { ...s, paybackAccountId: accountId } : s,
          );
          commitRows(next);
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
