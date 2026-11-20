import { Minus, Plus, SlidersHorizontal } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { sanitizeAmountInput } from '~/features/onboarding/lib/onboardingMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { WageConfig, WageType } from '~/types';
import { cn } from '~/utils';
import { FONT } from '~/utils/fonts';
import { computeHourlyRates, formatCurrency } from '~/utils/formatters';

const WAGE_TYPES: WageType[] = ['hourly', 'monthly', 'yearly'];
const MIN_HOURS = 1;
const MAX_HOURS = 100;
const MAX_AMOUNT = 1_000_000_000;

function amountToText(amount: number): string {
  return amount > 0 ? String(amount) : '';
}

interface OnboardingIncomeStepProps {
  config: WageConfig;
  currencySymbol: string;
  onChange: (config: WageConfig) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  /** Opens the full calculator (commute, workdays) on the current values. */
  onFineTune: () => void;
}

/**
 * Pay, hours and the hourly value they make, on one page. The full calculator
 * (commute and other unpaid time) is one link away for those who want it.
 */
export function OnboardingIncomeStep({
  config,
  currencySymbol,
  onChange,
  onBack,
  onContinue,
  onSkip,
  onFineTune,
}: OnboardingIncomeStepProps) {
  const themeColors = useThemeColors();
  const [amountText, setAmountText] = useState(() => amountToText(config.wageAmount));

  // The calculator can change the amount behind this field; follow it unless
  // the field already says the same number (so "12." keeps its point).
  useEffect(() => {
    setAmountText((current) =>
      Number(current || 0) === config.wageAmount ? current : amountToText(config.wageAmount),
    );
  }, [config.wageAmount]);

  const { trueHourlyRate } = computeHourlyRates(config);
  const hasRate = trueHourlyRate > 0;
  const showHours = config.wageType !== 'hourly';

  const setHours = (next: number) => {
    const clamped = Math.min(MAX_HOURS, Math.max(MIN_HOURS, next));
    if (clamped === config.hoursWorkedPerWeek) return;
    void triggerHaptic('selection');
    onChange({ ...config, hoursWorkedPerWeek: clamped });
  };

  return (
    <OnboardingStepLayout
      title={I18n.t('onboarding.income.title')}
      subtitle={I18n.t('onboarding.income.subtitle')}
      mascot="thinking"
      onBack={onBack}
      scrollToEndOnKeyboard
      primaryLabel={I18n.t('common.continue')}
      primaryDisabled={!hasRate}
      onPrimary={() => {
        void triggerHaptic('medium');
        onContinue();
      }}
      secondary={{
        label: I18n.t('onboarding.income.skip'),
        onPress: () => {
          void triggerHaptic('selection');
          onSkip();
        },
      }}
    >
      <View className="gap-3">
        <View className="flex-row rounded-full border border-border/40 bg-card p-1">
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
                  'h-10 flex-1 items-center justify-center rounded-full',
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

        <View className="rounded-[22px] border border-border/40 bg-card px-4 pb-3 pt-4">
          <Text variant="caption" tone="muted">
            {I18n.t('onboarding.income.pay_label')}
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
              accessibilityLabel={I18n.t('onboarding.income.pay_label')}
              className="ml-1 flex-1 text-foreground"
              style={[
                SINGLE_LINE_TEXT_INPUT_STYLE,
                { fontFamily: FONT.extrabold, fontWeight: '800', fontSize: 38, height: 48 },
              ]}
            />
          </View>
        </View>

        {showHours ? (
          <View className="flex-row items-center rounded-[22px] border border-border/40 bg-card px-4 py-3">
            <Text variant="bodyStrong" className="flex-1 text-foreground">
              {I18n.t('onboarding.income.hours_label')}
            </Text>
            <StepperButton
              icon="minus"
              label={I18n.t('onboarding.income.decrease_hours')}
              disabled={config.hoursWorkedPerWeek <= MIN_HOURS}
              onPress={() => setHours(config.hoursWorkedPerWeek - 1)}
            />
            <Text variant="subheading" className="w-12 text-center text-foreground">
              {config.hoursWorkedPerWeek}
            </Text>
            <StepperButton
              icon="plus"
              label={I18n.t('onboarding.income.increase_hours')}
              disabled={config.hoursWorkedPerWeek >= MAX_HOURS}
              onPress={() => setHours(config.hoursWorkedPerWeek + 1)}
            />
          </View>
        ) : null}

        <View className="rounded-[22px] border border-primary/25 bg-primary/10 px-4 py-4">
          <Text variant="caption" tone="primary">
            {I18n.t('onboarding.income.rate_label')}
          </Text>
          <Text
            variant="display"
            className={cn('mt-1', hasRate ? 'text-primary' : 'text-primary/30')}
          >
            {I18n.t('onboarding.income.rate_value', {
              rate: formatCurrency(trueHourlyRate, currencySymbol),
            })}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onFineTune();
          }}
          className="flex-row items-center gap-1.5 self-start py-2"
          accessibilityRole="button"
        >
          <SlidersHorizontal size={14} color={themeColors.primary} strokeWidth={2.2} />
          <Text variant="caption" tone="primary">
            {I18n.t('onboarding.income.fine_tune')}
          </Text>
        </Pressable>
      </View>
    </OnboardingStepLayout>
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
