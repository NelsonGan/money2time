import { Minus, Plus, SlidersHorizontal } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { InfoTooltipButton, Text } from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { ONBOARDING_CARD, ONBOARDING_CARD_SELECTED } from '~/features/onboarding/constants/styles';
import { sanitizeAmountInput } from '~/features/onboarding/lib/onboardingMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { WageConfig, WageType } from '~/types';
import { cn } from '~/utils';
import { FONT } from '~/utils/fonts';
import { computeHourlyRates, formatCurrency } from '~/utils/formatters';

const WAGE_TYPES: WageType[] = ['hourly', 'monthly', 'yearly'];
const MAX_AMOUNT = 1_000_000_000_000;
// The most a week or a day can hold. A month saved before these caps (or from
// the Web Dashboard) can sit above them; stepping down then goes one step.
const HOURS = { min: 1, max: 168, step: 1 };
const WORKDAYS = { min: 1, max: 7, step: 1 };
const EXTRA_MINUTES = { min: 0, max: 1440, step: 5 };

function numberToText(value: number): string {
  return value > 0 ? String(value) : '';
}

/** Two decimals, so stepping 37.5 hours by one never shows 38.50000001. */
function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A field's text follows the number it shows, unless the text already says
 * that number (so "12." keeps its point while typing). An empty field says
 * `emptyValue`, the number its placeholder shows.
 */
function useNumberText(value: number, emptyValue = 0) {
  const [text, setText] = useState(() => numberToText(value));
  useEffect(() => {
    setText((current) => (Number(current || emptyValue) === value ? current : numberToText(value)));
  }, [value, emptyValue]);
  return [text, setText] as const;
}

interface WageFormProps {
  config: WageConfig;
  currencySymbol: string;
  onChange: (config: WageConfig) => void;
}

/**
 * Pay, hours and the hourly value they make, on one page, in the onboarding's
 * cards. "Add commute and more" opens the workdays and extra time fields in
 * place; removing them zeroes the extra time again.
 */
export function WageForm({ config, currencySymbol, onChange }: WageFormProps) {
  const themeColors = useThemeColors();
  const [amountText, setAmountText] = useNumberText(config.wageAmount);
  // Open when the wage already counts extra time, so editing it shows it.
  const [showExtras, setShowExtras] = useState(() => config.commuteMinutesPerWorkday > 0);

  const { trueHourlyRate, baseHourlyRate, trueHoursPerWeek } = computeHourlyRates(config);
  const hasRate = trueHourlyRate > 0;
  // An hourly wage needs the hours only to spread extra time over them.
  const showHours = config.wageType !== 'hourly' || showExtras;
  const countsExtraTime = showExtras && config.commuteMinutesPerWorkday > 0 && hasRate;

  return (
    <View className="gap-3">
      <View className={`flex-row p-1 ${ONBOARDING_CARD}`}>
        {WAGE_TYPES.map((type) => {
          const active = config.wageType === type;
          return (
            <Pressable
              key={type}
              onPress={() => {
                if (active) return;
                void triggerHaptic('selection');
                onChange({ ...config, wageType: type });
              }}
              className={cn(
                'h-10 flex-1 items-center justify-center rounded-[18px]',
                active && 'bg-primary',
              )}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                variant="caption"
                className={cn(
                  'text-[14px]',
                  active ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {I18n.t(`wage.type.${type}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className={`px-4 pb-3 pt-4 ${ONBOARDING_CARD}`}>
        <Text variant="caption" tone="muted">
          {I18n.t('wage.pay_label')}
        </Text>
        <View className="mt-1 flex-row items-center">
          <Text variant="display" tone="muted">
            {currencySymbol}
          </Text>
          <TextInput
            value={amountText}
            onChangeText={(raw) => {
              const next = sanitizeAmountInput(raw);
              const amount = Number(next || 0);
              if (!Number.isFinite(amount) || amount > MAX_AMOUNT) return;
              setAmountText(next);
              onChange({ ...config, wageAmount: amount });
            }}
            placeholder="0"
            placeholderTextColor={`${themeColors.textMuted}66`}
            keyboardType="decimal-pad"
            selectionColor={themeColors.primary}
            accessibilityLabel={I18n.t('wage.pay_label')}
            className="ml-1 flex-1 text-foreground"
            style={[
              SINGLE_LINE_TEXT_INPUT_STYLE,
              { fontFamily: FONT.extrabold, fontWeight: '800', fontSize: 38, height: 48 },
            ]}
          />
        </View>
      </View>

      {showHours ? (
        <View className={`px-4 py-3 ${ONBOARDING_CARD}`}>
          <StepperField
            label={I18n.t('wage.hours_label')}
            decreaseLabel={I18n.t('wage.decrease_hours')}
            increaseLabel={I18n.t('wage.increase_hours')}
            value={config.hoursWorkedPerWeek}
            range={HOURS}
            onChange={(hoursWorkedPerWeek) => onChange({ ...config, hoursWorkedPerWeek })}
          />
        </View>
      ) : null}

      {showExtras ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          className={`gap-3 px-4 pb-3 pt-2 ${ONBOARDING_CARD}`}
        >
          <View className="flex-row items-center gap-1">
            <Text variant="bodyStrong" className="text-foreground">
              {I18n.t('wage.extra_title')}
            </Text>
            <InfoTooltipButton
              title={I18n.t('wage.extra_title')}
              infoTooltip={I18n.t('wage.commute_helper')}
            />
            <View className="flex-1" />
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setShowExtras(false);
                onChange({ ...config, commuteMinutesPerWorkday: 0 });
              }}
              hitSlop={8}
              className="py-2 pl-3"
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.remove')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.remove')}
              </Text>
            </Pressable>
          </View>
          <StepperField
            label={I18n.t('wage.workdays_per_week')}
            decreaseLabel={I18n.t('wage.decrease_workdays')}
            increaseLabel={I18n.t('wage.increase_workdays')}
            value={config.workdaysPerWeek}
            range={WORKDAYS}
            onChange={(workdaysPerWeek) => onChange({ ...config, workdaysPerWeek })}
          />
          <StepperField
            label={I18n.t('wage.commute_minutes')}
            decreaseLabel={I18n.t('wage.decrease_minutes')}
            increaseLabel={I18n.t('wage.increase_minutes')}
            value={config.commuteMinutesPerWorkday}
            range={EXTRA_MINUTES}
            onChange={(commuteMinutesPerWorkday) =>
              onChange({ ...config, commuteMinutesPerWorkday })
            }
          />
        </Animated.View>
      ) : null}

      <HourlyResult
        config={config}
        currencySymbol={currencySymbol}
        trueHourlyRate={trueHourlyRate}
        baseHourlyRate={baseHourlyRate}
        trueHoursPerWeek={trueHoursPerWeek}
        showsExtraTime={countsExtraTime}
      />

      {showExtras ? null : (
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            setShowExtras(true);
          }}
          className="flex-row items-center gap-1.5 self-start py-2"
          accessibilityRole="button"
        >
          <SlidersHorizontal size={14} color={themeColors.primary} strokeWidth={2.2} />
          <Text variant="caption" tone="primary">
            {I18n.t('wage.add_extra')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function formatHours(hours: number): string {
  return `${roundTwo(hours)}${I18n.t('common.hour_unit')}`;
}

interface HourlyResultProps {
  config: WageConfig;
  currencySymbol: string;
  trueHourlyRate: number;
  baseHourlyRate: number;
  trueHoursPerWeek: number;
  /** Whether extra time lowers the rate, which the card then explains. */
  showsExtraTime: boolean;
}

/**
 * The hourly value the form makes: the number large, its currency and unit
 * small beside it, and, when extra time counts, the paid rate it came down
 * from with a bar of paid against unpaid hours.
 */
function HourlyResult({
  config,
  currencySymbol,
  trueHourlyRate,
  baseHourlyRate,
  trueHoursPerWeek,
  showsExtraTime,
}: HourlyResultProps) {
  const { primary } = useThemeColors();
  const hasRate = trueHourlyRate > 0;
  const unitColor = `${primary}${hasRate ? '99' : '4D'}`;
  const perHour = I18n.t('settings.hourly_suffix_hourly');
  const paidHours = config.hoursWorkedPerWeek;
  const extraHours = Math.max(0, trueHoursPerWeek - paidHours);

  return (
    <View className={`px-4 pb-4 pt-3.5 ${ONBOARDING_CARD_SELECTED}`}>
      <Text variant="caption" tone="primary">
        {I18n.t('wage.rate_label')}
      </Text>
      {/* One line of text, so the symbol, digits and unit share a baseline. */}
      <Text
        variant="display"
        numberOfLines={1}
        className={cn('mt-1', hasRate ? 'text-primary' : 'text-primary/30')}
      >
        <RNText style={[styles.unit, { color: unitColor }]}>{currencySymbol}</RNText>
        {formatCurrency(trueHourlyRate, '')}
        <RNText style={[styles.unit, { color: unitColor }]}>{perHour}</RNText>
      </Text>
      {showsExtraTime ? (
        <View className="mt-2 gap-2">
          <Text variant="caption" tone="muted">
            {I18n.t('wage.base_rate', {
              rate: `${formatCurrency(baseHourlyRate, currencySymbol)}${perHour}`,
            })}
          </Text>
          <View
            className="h-2 flex-row gap-0.5"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[styles.barPart, { flex: paidHours, backgroundColor: `${primary}40` }]} />
            <View
              style={[styles.barPart, { flex: extraHours, minWidth: 6, backgroundColor: primary }]}
            />
          </View>
          <Text variant="caption" tone="muted">
            {I18n.t('wage.time_split', {
              paid: formatHours(paidHours),
              extra: formatHours(extraHours),
              total: formatHours(trueHoursPerWeek),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface StepperFieldProps {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  range: { min: number; max: number; step: number };
  onChange: (value: number) => void;
}

/** A label, minus and plus buttons, and the number between them, which can also be typed. */
function StepperField({
  label,
  decreaseLabel,
  increaseLabel,
  value,
  range,
  onChange,
}: StepperFieldProps) {
  const themeColors = useThemeColors();
  const [text, setText] = useNumberText(value, range.min);

  const step = (direction: 1 | -1) => {
    const next = roundTwo(
      direction > 0
        ? Math.min(range.max, value + range.step)
        : Math.max(range.min, value - range.step),
    );
    if (next === value) return;
    void triggerHaptic('selection');
    onChange(next);
  };

  return (
    <View className="flex-row items-center">
      <Text variant="bodyStrong" className="flex-1 pr-2 text-foreground">
        {label}
      </Text>
      <StepperButton
        icon="minus"
        label={decreaseLabel}
        disabled={value <= range.min}
        onPress={() => step(-1)}
      />
      <TextInput
        value={text}
        onChangeText={(raw) => {
          const next = sanitizeAmountInput(raw);
          const parsed = Number(next || 0);
          if (!Number.isFinite(parsed) || parsed > range.max) return;
          setText(next);
          // Typing passes through values under the minimum ("" on the way to
          // "40"). The form holds the minimum for them, the number the empty
          // field's placeholder shows, so Save tapped before leaving the field
          // never saves a leftover (the 4 of a backspaced 40) or a 0.
          onChange(Math.max(range.min, parsed));
        }}
        onBlur={() => setText(numberToText(value))}
        placeholder={String(range.min)}
        placeholderTextColor={`${themeColors.textMuted}66`}
        keyboardType="decimal-pad"
        selectTextOnFocus
        selectionColor={themeColors.primary}
        accessibilityLabel={label}
        className="w-14 text-center text-foreground"
        style={[
          SINGLE_LINE_TEXT_INPUT_STYLE,
          { fontFamily: FONT.bold, fontWeight: '700', fontSize: 18, height: 40 },
        ]}
      />
      <StepperButton
        icon="plus"
        label={increaseLabel}
        disabled={value >= range.max}
        onPress={() => step(1)}
      />
    </View>
  );
}

function StepperButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'minus' | 'plus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const themeColors = useThemeColors();
  const Icon = icon === 'minus' ? Minus : Plus;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={cn(
        'h-9 w-9 items-center justify-center rounded-xl border border-border/50 active:bg-secondary/80',
        disabled && 'opacity-40',
      )}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={16} color={themeColors.text} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The currency and unit beside the hourly value: smaller and lighter, so the
  // digits carry it.
  unit: { fontFamily: FONT.bold, fontWeight: '700', fontSize: 22 },
  barPart: { borderRadius: 999 },
});
