import { Check, ChevronRight, Minus, Pencil, Plus, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp } from '~/context/AppContext';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromIsoLocal, formatAmount } from '~/utils/formatters';

import { formatPlanDay } from '../lib/format';
import {
  canSplitInstalments,
  clampInstalmentCount,
  INSTALMENT_COUNT_PRESETS,
  INSTALMENT_FREQUENCIES,
  instalmentAmounts,
  type InstalmentFrequency,
  instalmentScheduleDates,
  isRegularAmountValid,
  MAX_INSTALMENT_COUNT,
  MIN_INSTALMENT_COUNT,
  regularAmountImpliesOtherTotal,
  scheduleOfFrequency,
  splitInstalmentAmounts,
} from '../lib/instalmentPlan';

export interface InstalmentChoice {
  count: number;
  frequency: InstalmentFrequency;
  /**
   * Each payment as the bank set it, when it differs from the even split.
   * The last payment takes what is left, so the plan adds up to its total.
   */
  amount?: number | null;
}

export const DEFAULT_INSTALMENT_CHOICE: InstalmentChoice = { count: 12, frequency: 'monthly' };

interface InstalmentSheetProps {
  visible: boolean;
  /** What the plan is set to now, or null when the form has no plan yet. */
  value: InstalmentChoice | null;
  /** A choice not applied yet, kept while the first payment's date is picked. */
  draft?: InstalmentChoice | null;
  /** The amount typed in the form: the plan's total. */
  total: number;
  currency: string;
  /** The form's date as an ISO instant: the first payment. */
  firstPaymentIso: string;
  onApply: (choice: InstalmentChoice) => void;
  onRemove: () => void;
  onClose: () => void;
  /**
   * Opens the form's own date picker to move the first payment, handing over
   * the choice so far so the sheet can come back to it.
   */
  onPickFirstPayment: (choice: InstalmentChoice) => void;
  /** Sets the form's amount: the plan's total, when the payments imply another. */
  onSetTotal: (total: number) => void;
}

/** The amounts and dates a choice gives, shared by the sheet and the form. */
export function describeInstalmentChoice(
  choice: InstalmentChoice,
  total: number,
  firstPaymentIso: string,
) {
  const { pattern, interval } = scheduleOfFrequency(choice.frequency);
  const custom = choice.amount != null;
  const valid = !custom || isRegularAmountValid(total, choice.count, choice.amount);
  const amounts = valid
    ? instalmentAmounts(total, choice.count, choice.amount)
    : splitInstalmentAmounts(total, choice.count);
  const dates = instalmentScheduleDates(firstPaymentIso, pattern, interval, choice.count);
  return {
    amounts,
    dates,
    /** The bank's amount when set (even when it does not fit the total). */
    regular: custom ? (choice.amount ?? 0) : (amounts[0] ?? 0),
    last: amounts[amounts.length - 1] ?? 0,
    custom,
    /** False when the set amount leaves nothing for the last payment. */
    valid,
    lastDate: dates[dates.length - 1] ?? firstPaymentIso,
  };
}

/**
 * Turns the form's amount into a plan: how many payments, how often, from
 * when. The payment it works out is the hero; everything else is one tap.
 */
export function InstalmentSheet({
  visible,
  value,
  draft = null,
  total,
  currency,
  firstPaymentIso,
  onApply,
  onRemove,
  onClose,
  onPickFirstPayment,
  onSetTotal,
}: InstalmentSheetProps) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();
  // The keyboard's height straight onto the sheet (as QuickAddSheet does):
  // KeyboardAvoidingView races the first open on Android.
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardLift = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.height.value }],
  }));
  const [choice, setChoice] = useState<InstalmentChoice>(
    draft ?? value ?? DEFAULT_INSTALMENT_CHOICE,
  );

  // Each opening starts from what the form holds, or the choice left off
  // when the date picker opened.
  useEffect(() => {
    if (visible) setChoice(draft ?? value ?? DEFAULT_INSTALMENT_CHOICE);
  }, [visible, value, draft]);

  const money = (amount: number) => formatAmount(amount, settings, { currencyCode: currency });
  const plan = useMemo(
    () => describeInstalmentChoice(choice, total, firstPaymentIso),
    [choice, total, firstPaymentIso],
  );
  const hasTotal = Number.isFinite(total) && total > 0;
  // A total under a cent a payment would make payments of zero.
  const canSplit = canSplitInstalments(total, choice.count);
  const canApply = canSplit && plan.valid;
  const startsToday =
    dayKeyFromIsoLocal(firstPaymentIso) === dayKeyFromIsoLocal(new Date().toISOString());

  const setCount = (count: number) => {
    void triggerHaptic('selection');
    // The bank's amount goes with its number of payments.
    setChoice((previous) => ({ ...previous, count: clampInstalmentCount(count), amount: null }));
  };
  const setFrequency = (frequency: InstalmentFrequency) => {
    void triggerHaptic('selection');
    setChoice((previous) => ({ ...previous, frequency }));
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        {/* Lifted by the keyboard while the payment amount is typed. */}
        <Animated.View style={keyboardLift}>
          <View style={sheetColumnStyle} className="max-h-[92%] rounded-t-[28px] bg-card">
            <View className="flex-row items-center px-5 pb-1 pt-5">
              <Text variant="subheading" className="flex-1">
                {I18n.t('instalments.sheet_title')}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
              >
                <X size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-6 px-5 pt-4">
                {/* The answer first: what each payment comes to. */}
                <View className="items-center gap-4" accessibilityLiveRegion="polite">
                  {canSplit ? (
                    <>
                      <PaymentAmount
                        amount={plan.regular}
                        evenAmount={splitInstalmentAmounts(total, choice.count)[0] ?? 0}
                        currency={currency}
                        perLabel={I18n.t(`instalments.per.${choice.frequency}`)}
                        money={money}
                        onChange={(amount) => setChoice((previous) => ({ ...previous, amount }))}
                      />
                      <PaymentTimeline
                        count={choice.count}
                        from={formatPlanDay(firstPaymentIso)}
                        to={formatPlanDay(plan.lastDate)}
                      />
                      {plan.custom ? (
                        <AmountBalance
                          valid={plan.valid}
                          last={plan.last}
                          regular={plan.regular}
                          count={choice.count}
                          total={total}
                          money={money}
                          onSplitEvenly={() =>
                            setChoice((previous) => ({ ...previous, amount: null }))
                          }
                          onSetTotal={(sum) => {
                            // Amount × payments is the new total, so the even
                            // split is the bank's amount exactly.
                            onSetTotal(sum);
                            setChoice((previous) => ({ ...previous, amount: null }));
                          }}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Text variant="body" tone="muted" className="py-4 text-center">
                      {hasTotal
                        ? I18n.t('instalments.total_too_small', { count: choice.count })
                        : I18n.t('instalments.enter_total_first')}
                    </Text>
                  )}
                </View>

                {/* How many: the common counts as chips, any other by the stepper. */}
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Text variant="bodyStrong">{I18n.t('instalments.payments_label')}</Text>
                    <View className="flex-row items-center overflow-hidden rounded-full border border-border/40 bg-secondary/40">
                      <Pressable
                        onPress={() => setCount(choice.count - 1)}
                        disabled={choice.count <= MIN_INSTALMENT_COUNT}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('instalments.fewer_payments')}
                        className="h-9 w-11 items-center justify-center active:opacity-60"
                        style={{ opacity: choice.count <= MIN_INSTALMENT_COUNT ? 0.35 : 1 }}
                      >
                        <Minus size={16} color={themeColors.text} />
                      </Pressable>
                      <View className="h-5 w-[1px] bg-border/50" />
                      <Pressable
                        onPress={() => setCount(choice.count + 1)}
                        disabled={choice.count >= MAX_INSTALMENT_COUNT}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('instalments.more_payments')}
                        className="h-9 w-11 items-center justify-center active:opacity-60"
                        style={{ opacity: choice.count >= MAX_INSTALMENT_COUNT ? 0.35 : 1 }}
                      >
                        <Plus size={16} color={themeColors.text} />
                      </Pressable>
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    {INSTALMENT_COUNT_PRESETS.map((count) => (
                      <ChoiceChip
                        key={count}
                        label={String(count)}
                        selected={choice.count === count}
                        onPress={() => setCount(count)}
                      />
                    ))}
                    {/* A count off the presets still shows which one is picked. */}
                    {!(INSTALMENT_COUNT_PRESETS as readonly number[]).includes(choice.count) ? (
                      <ChoiceChip label={String(choice.count)} selected onPress={() => undefined} />
                    ) : null}
                  </View>
                </View>

                {/* How often. */}
                <View className="gap-3">
                  <Text variant="bodyStrong">{I18n.t('instalments.frequency_label')}</Text>
                  <View className="flex-row rounded-2xl border border-border/30 bg-secondary/40 p-1">
                    {INSTALMENT_FREQUENCIES.map((frequency) => {
                      const selected = choice.frequency === frequency;
                      return (
                        <Pressable
                          key={frequency}
                          onPress={() => setFrequency(frequency)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={cn(
                            'h-10 flex-1 items-center justify-center rounded-xl px-1 active:opacity-70',
                            selected ? 'border border-primary/40 bg-card' : '',
                          )}
                        >
                          <Text
                            variant="caption"
                            numberOfLines={1}
                            className={cn(
                              'text-[14px]',
                              selected ? 'text-primary' : 'text-muted-foreground',
                            )}
                          >
                            {I18n.t(`instalments.frequency.${frequency}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* When the first payment falls: the form's own date. */}
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onPickFirstPayment(choice);
                  }}
                  accessibilityRole="button"
                  className="h-12 flex-row items-center gap-2 border-y border-border/30 active:opacity-70"
                >
                  <Text variant="bodyStrong" className="flex-1">
                    {I18n.t('instalments.first_payment')}
                  </Text>
                  <Text variant="body" tone="muted">
                    {startsToday
                      ? `${I18n.t('common.today')}, ${formatPlanDay(firstPaymentIso)}`
                      : formatPlanDay(firstPaymentIso)}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>

                <View className="gap-1">
                  <Button
                    onPress={() => {
                      void triggerHaptic('success');
                      onApply(choice);
                    }}
                    disabled={!canApply}
                    style={{ opacity: canApply ? 1 : 0.5 }}
                    accessibilityRole="button"
                  >
                    <Text>{I18n.t('common.done')}</Text>
                  </Button>
                  {value ? (
                    <Button variant="ghost" size="sm" onPress={onRemove} accessibilityRole="button">
                      <Text className="text-destructive">{I18n.t('instalments.remove')}</Text>
                    </Button>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </ThemeModal>
  );
}

/**
 * The payment each period comes to, in large type. Tapping it types the
 * bank's own figure in its place; clearing it, or typing the even split,
 * goes back to the even split.
 */
function PaymentAmount({
  amount,
  evenAmount,
  currency,
  perLabel,
  money,
  onChange,
}: {
  amount: number;
  evenAmount: number;
  currency: string;
  perLabel: string;
  money: (amount: number) => string;
  onChange: (amount: number | null) => void;
}) {
  const themeColors = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const startEditing = () => {
    void triggerHaptic('selection');
    // Empty, with the current amount as the hint: typing replaces it (iOS
    // does not reliably select an autofocused field's text).
    setText('');
    setEditing(true);
  };
  const commit = () => {
    if (!editing) return;
    setEditing(false);
    Keyboard.dismiss();
    const parsed = Number(text.replace(',', '.'));
    if (!text.trim() || !Number.isFinite(parsed) || parsed <= 0) return;
    const cents = Math.round(parsed * 100) / 100;
    onChange(cents === evenAmount ? null : cents);
  };

  if (editing) {
    return (
      <View className="flex-row items-center gap-2">
        <Text variant="title" tone="muted">
          {currencySymbolForCode(currency)}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          placeholder={amount.toFixed(2)}
          placeholderTextColor={themeColors.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel={I18n.t('instalments.payment_amount')}
          className="min-w-[96px] border-b-2 border-primary/50 pb-0.5 text-[34px] font-bold text-foreground"
          style={{ color: themeColors.text }}
        />
        <Pressable
          onPress={commit}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.done')}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-70"
        >
          <Check size={18} color="#fff" strokeWidth={3} />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      onPress={startEditing}
      accessibilityRole="button"
      accessibilityLabel={`${money(amount)} ${perLabel}`}
      accessibilityHint={I18n.t('instalments.edit_amount_hint')}
      className="flex-row items-baseline gap-1.5 active:opacity-70"
    >
      <Text variant="display">{money(amount)}</Text>
      <Text variant="body" tone="muted">
        {perLabel}
      </Text>
      <View className="ml-0.5 self-center">
        <Pencil size={15} color={themeColors.textMuted} />
      </View>
    </Pressable>
  );
}

/**
 * How a set amount balances: the last payment takes what the others leave.
 * When the payments come to clearly more than the total (interest or a
 * fee), it offers that sum as the total instead.
 */
function AmountBalance({
  valid,
  last,
  regular,
  count,
  total,
  money,
  onSplitEvenly,
  onSetTotal,
}: {
  valid: boolean;
  last: number;
  regular: number;
  count: number;
  total: number;
  money: (amount: number) => string;
  onSplitEvenly: () => void;
  onSetTotal: (total: number) => void;
}) {
  const sum = Math.round(regular * 100 * count) / 100;
  const offerTotal = !valid || regularAmountImpliesOtherTotal(total, count, regular);
  return (
    <View className="gap-2 self-stretch">
      <View className="flex-row items-center justify-between gap-3">
        <Text
          variant="caption"
          tone={valid ? 'muted' : 'error'}
          className="min-w-0 flex-1"
          numberOfLines={2}
        >
          {valid
            ? I18n.t('instalments.last_payment', { amount: money(last) })
            : I18n.t('instalments.amount_over_total', {
                amount: money(regular),
                count,
                sum: money(sum),
              })}
        </Text>
        <Pressable onPress={onSplitEvenly} accessibilityRole="button" hitSlop={8}>
          <Text variant="caption" tone="primary" className="font-semibold">
            {I18n.t('instalments.split_evenly')}
          </Text>
        </Pressable>
      </View>
      {offerTotal ? (
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onSetTotal(sum);
          }}
          accessibilityRole="button"
          className="self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 active:opacity-70"
        >
          <Text variant="caption" tone="primary" className="font-semibold">
            {I18n.t('instalments.use_as_total', { amount: money(sum) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Past this many payments the dots would crowd: the track is drawn plain. */
const MAX_TIMELINE_DOTS = 24;

/** The plan at a glance: one dot per payment between the first and last dates. */
function PaymentTimeline({ count, from, to }: { count: number; from: string; to: string }) {
  const dots = count <= MAX_TIMELINE_DOTS ? count : 2;
  return (
    <View className="gap-2 self-stretch" accessible accessibilityLabel={`${from} – ${to}`}>
      <View className="flex-row justify-between gap-2">
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {from}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {to}
        </Text>
      </View>
      <View className="h-2.5 flex-row items-center">
        {Array.from({ length: dots }, (_, index) => {
          const end = index === 0 || index === dots - 1;
          return (
            <React.Fragment key={index}>
              {index > 0 ? <View className="h-[1.5px] flex-1 bg-border" /> : null}
              <View
                className={cn(
                  'rounded-full',
                  end ? 'h-2.5 w-2.5 bg-primary' : 'h-1.5 w-1.5 bg-muted-foreground/40',
                )}
              />
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        'h-11 flex-1 items-center justify-center rounded-2xl border active:opacity-70',
        selected ? 'border-primary/50 bg-primary/15' : 'border-border/30 bg-secondary/50',
      )}
    >
      <Text variant="bodyStrong" className={selected ? 'text-primary' : ''}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
});
