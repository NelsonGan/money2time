import { Check, ChevronLeft, Plus, RotateCcw, Trash2, UserRound } from 'lucide-react-native';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountPickerSheet, Text, ThemeModal } from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { useTransactions, type SplitDraftInput } from '~/context/AppContext';
import { recentSplitPersonNames } from '~/features/transactions/lib/settleUp';
import type { Account, AccountGroup } from '~/types';
import { cn } from '~/utils';
import { formatAmount, normalizeMoneyAmount } from '~/utils/formatters';
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
}

interface SplitBillModalProps {
  visible: boolean;
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
  amountInput: {
    minWidth: 70,
    textAlign: 'right',
  },
  nameInput: {
    flex: 1,
  },
});

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
): SplitDraftInput[] {
  return splits.map((s, idx) => ({
    id: s.id,
    personName: s.personName.trim() || null,
    amount: Number(s.amount) || 0,
    isSelf: s.isSelf,
    paybackAccountId: s.paybackAccountId ?? fallbackAccountId ?? null,
    sortOrder: idx,
    paid: s.paid,
  }));
}

export const splitsHelpers = {
  distributeEvenly,
  toSplitDraftInputs,
  distributeEvenlyAcrossUnpaid,
  autoBalanceSelf,
};

export function SplitBillModal({
  visible,
  onCancel,
  onDone,
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
  const [accountPickerForKey, setAccountPickerForKey] = useState<string | null>(null);

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
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentNames = useMemo(
    () => (visible ? recentSplitPersonNames(transactions) : []),
    [visible, transactions],
  );

  const handleNameFocus = useCallback((index: number) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
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
  // Drop any stale focus when the modal hides so the drop-up can't linger.
  useEffect(() => {
    if (!visible) setFocusedNameIndex(null);
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

  const friendCount = splits.filter((s) => !s.isSelf).length;
  const paidCount = splits.filter((s) => !s.isSelf && s.paid).length;

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
    onChange(splitEvenly ? applyEvenSplit(next) : autoBalanceSelf(next, total));
  }, [applyEvenSplit, defaultAccountId, onChange, splitEvenly, splits, total]);

  const handleRemove = useCallback(
    (index: number) => {
      void triggerHaptic('warning');
      const target = splits[index];
      if (!target || target.isSelf) return;
      // Removing a paid row drops the local entry but leaves the linked
      // transfer + parent's reduced amount alone — the user can clean up the
      // transfer separately from the activity list if they want.
      const next = splits.filter((_, i) => i !== index);
      onChange(splitEvenly ? applyEvenSplit(next) : autoBalanceSelf(next, total));
    },
    [applyEvenSplit, onChange, splitEvenly, splits, total],
  );

  const handleNameChange = useCallback(
    (index: number, value: string) => {
      onChange(splits.map((row, i) => (i === index ? { ...row, personName: value } : row)));
    },
    [onChange, splits],
  );

  const handleAmountChange = useCallback(
    (index: number, value: string) => {
      const target = splits[index];
      if (!target || target.paid) return;
      if (splitEvenly) onSplitEvenlyChange(false);

      // Strip anything other than digits + decimal point so '-' / letters can't
      // sneak in. Beyond that, accept whatever the user types — over-allocation
      // is allowed, the sum bar shows the mismatch, and Save blocks if it's
      // still off when they try to save.
      const cleaned = value.replace(/[^0-9.]/g, '');
      const next = splits.map((row, i) => (i === index ? { ...row, amount: cleaned } : row));
      // Editing Me redistributes the remaining across friends; editing a
      // friend balances Me. Symmetric in both directions.
      onChange(
        target.isSelf ? autoBalanceFriends(next, total) : autoBalanceSelf(next, total, index),
      );
    },
    [onChange, onSplitEvenlyChange, splitEvenly, splits, total],
  );

  const handleAmountBlur = useCallback(
    (index: number) => {
      const row = splits[index];
      if (!row) return;
      const numeric = Number(row.amount);
      const safeNumeric = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
      const normalized = normalizeMoneyAmount(safeNumeric).toFixed(2);
      const next = splits.map((r, i) => (i === index ? { ...r, amount: normalized } : r));
      onChange(row.isSelf ? autoBalanceFriends(next, total) : autoBalanceSelf(next, total));
    },
    [onChange, splits, total],
  );

  const sumMatches = Math.abs(diff) < 0.005;

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

  const subtitle =
    friendCount === 0
      ? null
      : paidCount >= friendCount
        ? I18n.t('transactions.editor.split.section_subtitle_all_paid')
        : I18n.t(
            friendCount - paidCount === 1
              ? 'transactions.editor.split.section_subtitle_unpaid'
              : 'transactions.editor.split.section_subtitle_unpaid_plural',
            { count: friendCount - paidCount },
          );

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/20">
          <Pressable
            onPress={handleCancel}
            className="w-9 h-9 rounded-full bg-secondary items-center justify-center"
          >
            <ChevronLeft size={18} color={themeColors.text} />
          </Pressable>
          <View className="items-center flex-1 px-2">
            <Text variant="bodyStrong">{I18n.t('transactions.editor.split.toggle_title')}</Text>
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={handleDone}
            disabled={!sumMatches}
            className={cn(
              'px-3.5 h-9 rounded-full items-center justify-center',
              sumMatches ? 'bg-primary' : 'bg-secondary',
            )}
            style={{ opacity: sumMatches ? 1 : 0.5 }}
          >
            <Text
              variant="caption"
              className={cn(
                'font-medium',
                sumMatches ? 'text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {I18n.t('common.done')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Total + status footer card */}
          <View className="mx-4 mt-4 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            <View className="px-4 py-3 flex-row items-center justify-between">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.editor.amount')}
              </Text>
              <Text variant="bodyStrong">{formatMoney(total)}</Text>
            </View>
            <View className="h-[1px] bg-border/15 mx-4" />
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
          </View>

          {/* Person rows card */}
          <View className="mx-4 mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            {splits.map((row, index) => {
              const acct = row.paybackAccountId ? accountById.get(row.paybackAccountId) : null;
              const fallbackAcct = defaultAccountId ? accountById.get(defaultAccountId) : null;
              const acctLabel = acct?.name ?? fallbackAcct?.name ?? I18n.t('common.no_account');
              const disabledRow = !!row.paid;
              const canMarkPaid = !row.isSelf && !!row.id && !disabledRow && !!onMarkPaid;
              const canUndo = disabledRow && !!row.id && !!onMarkUnpaid && newlyPaidIds.has(row.id);
              const rowKey = row.id ?? `new_${index}`;
              return (
                <View key={rowKey}>
                  {index > 0 ? <View className="h-[1px] bg-border/15 mx-4" /> : null}
                  <View className="px-4 py-3">
                    <View className="flex-row items-center gap-2.5">
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
                            {I18n.t('transactions.editor.split.me_label').slice(0, 1).toUpperCase()}
                          </Text>
                        ) : row.personName.trim() ? (
                          <Text variant="caption" className="font-semibold">
                            {row.personName.trim()[0]?.toUpperCase()}
                          </Text>
                        ) : (
                          <UserRound size={15} color={themeColors.textMuted} />
                        )}
                      </View>

                      <TextInput
                        value={
                          row.isSelf ? I18n.t('transactions.editor.split.me_label') : row.personName
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
                          styles.nameInput,
                          {
                            color: disabledRow ? themeColors.textMuted : themeColors.text,
                            fontSize: 15,
                          },
                        ]}
                      />

                      <Text variant="caption" tone="muted">
                        {currencySymbol}
                      </Text>
                      <TextInput
                        value={row.amount}
                        editable={!disabledRow}
                        onChangeText={(text) => handleAmountChange(index, text)}
                        onBlur={() => handleAmountBlur(index)}
                        selectTextOnFocus
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={`${themeColors.mutedForeground}99`}
                        style={[
                          SINGLE_LINE_TEXT_INPUT_STYLE,
                          styles.amountInput,
                          {
                            color: disabledRow ? themeColors.textMuted : themeColors.text,
                            fontSize: 15,
                          },
                        ]}
                      />
                    </View>

                    {!row.isSelf ? (
                      disabledRow ? (
                        <View className="flex-row items-center justify-between mt-2 pl-11 gap-2">
                          <Text
                            variant="caption"
                            tone="muted"
                            numberOfLines={1}
                            className="flex-1 min-w-0"
                          >
                            {I18n.t('transactions.editor.split.paid_label', {
                              date: row.paid?.paidAt
                                ? new Date(row.paid.paidAt).toLocaleDateString()
                                : '',
                            })}
                            {' · '}
                            {acctLabel}
                          </Text>
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
                        <View className="flex-row items-center mt-2 gap-2">
                          {/* Trash sits under the avatar (w-9 + gap-2.5 = ~44px / pl-11). */}
                          <View className="w-9 items-center">
                            <Pressable
                              onPress={() => handleRemove(index)}
                              hitSlop={8}
                              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                              className="h-7 w-7 rounded-full bg-destructive/10 items-center justify-center"
                            >
                              <Trash2 size={14} color={themeColors.error} />
                            </Pressable>
                          </View>
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
                    ) : null}
                  </View>
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

        {/* Sum status: sticky bar tracked above the keyboard */}
        <View
          className="bg-card border-t border-border/30"
          style={{
            marginBottom: keyboardHeight,
            paddingBottom: keyboardHeight > 0 ? 4 : Math.max(insets.bottom, 12),
          }}
        >
          <View className="px-5 pt-3 pb-2 items-center">
            <View className="flex-row items-center gap-2">
              <Text variant="bodyStrong" className="text-foreground">
                {I18n.t('transactions.editor.split.sum_match', {
                  sum: formatMoney(unpaidSum),
                  total: formatMoney(total),
                })}
              </Text>
              {sumMatches ? <Check size={16} color={themeColors.success} /> : null}
            </View>
            {!sumMatches ? (
              <Text
                variant="caption"
                className={cn('mt-0.5', diff > 0 ? 'text-success' : 'text-destructive')}
              >
                {diff > 0
                  ? I18n.t('transactions.editor.split.sum_left', {
                      diff: formatMoney(diff),
                    })
                  : I18n.t('transactions.editor.split.sum_over', {
                      diff: formatMoney(Math.abs(diff)),
                    })}
              </Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

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
    </ThemeModal>
  );
}
