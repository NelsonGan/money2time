import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '~/components/feedback/Mascot';
import {
  Button,
  Card,
  CardContent,
  Input,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { UserSettings, WageConfig, WageType } from '~/types';
import { cn } from '~/utils';
import { computeHourlyRates, formatCurrency, parseMonthKey } from '~/utils/formatters';

interface WageCalculatorFlowScreenProps {
  initialConfig: WageConfig;
  settings: UserSettings;
  monthLabel: string;
  onCancel: () => void;
  onComplete: (config: WageConfig) => void;
}

const WAGE_FLOW_STEPS = [1, 2, 3, 4, 5] as const;

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  headerSection: {
    marginBottom: spacing.lg,
  },
  stepBadgeRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  stepEmoji: {
    fontSize: 24,
  },
  progressRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
});

function sanitizeNonNegativeDecimalInput(raw: string): string {
  const normalized = raw.replace(',', '.');
  const cleaned = normalized.replace(/[^0-9.]/g, '');
  if (cleaned.length === 0) return '';

  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex < 0) return cleaned;

  const integerPart = cleaned.slice(0, firstDotIndex);
  const decimalPart = cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
  return `${integerPart}.${decimalPart}`;
}

function toNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function WageCalculatorFlowScreen({
  initialConfig,
  settings,
  monthLabel,
  onCancel,
  onComplete,
}: WageCalculatorFlowScreenProps) {
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const [step, setStep] = useState(1);
  const [wageType, setWageType] = useState<WageType>(initialConfig.wageType);
  const [wageAmount, setWageAmount] = useState(() => {
    const value = toNonNegativeNumber(initialConfig.wageAmount);
    return value > 0 ? String(value) : '';
  });
  const [hoursWorkedPerWeek, setHoursWorkedPerWeek] = useState(
    String(toNonNegativeNumber(initialConfig.hoursWorkedPerWeek)),
  );
  const [workdaysPerWeek, setWorkdaysPerWeek] = useState(
    String(toNonNegativeNumber(initialConfig.workdaysPerWeek)),
  );
  const [commuteMinutesPerWorkday, setCommuteMinutesPerWorkday] = useState(
    String(toNonNegativeNumber(initialConfig.commuteMinutesPerWorkday)),
  );

  const config = useMemo<WageConfig>(
    () => ({
      wageType,
      wageAmount: Number(wageAmount) || 0,
      hoursWorkedPerWeek: Number(hoursWorkedPerWeek) || 0,
      workdaysPerWeek: Number(workdaysPerWeek) || 0,
      commuteMinutesPerWorkday: Number(commuteMinutesPerWorkday) || 0,
    }),
    [commuteMinutesPerWorkday, hoursWorkedPerWeek, wageAmount, wageType, workdaysPerWeek],
  );

  const metrics = useMemo(() => computeHourlyRates(config), [config]);
  const stepMetaList = useMemo(
    () => [
      { emoji: '💰', title: I18n.t('wage.step_1_title'), subtitle: I18n.t('wage.step_1_subtitle') },
      { emoji: '📅', title: I18n.t('wage.step_2_title'), subtitle: I18n.t('wage.step_2_subtitle') },
      { emoji: '🚗', title: I18n.t('wage.step_3_title'), subtitle: I18n.t('wage.step_3_subtitle') },
      { emoji: '🧮', title: I18n.t('wage.step_4_title'), subtitle: I18n.t('wage.step_4_subtitle') },
      { emoji: '✨', title: I18n.t('wage.step_5_title'), subtitle: I18n.t('wage.step_5_subtitle') },
    ],
    [],
  );
  const wageTypeLabels = useMemo<Record<WageType, string>>(
    () => ({
      hourly: I18n.t('wage.type.hourly'),
      monthly: I18n.t('wage.type.monthly'),
      yearly: I18n.t('wage.type.yearly'),
    }),
    [],
  );

  const canContinue =
    (step === 1 && config.wageAmount > 0) ||
    (step === 2 && config.hoursWorkedPerWeek > 0 && config.workdaysPerWeek > 0) ||
    step >= 3;

  const next = () => {
    void triggerHaptic('selection');
    setStep((prev) => Math.min(prev + 1, 5));
  };
  const back = () => {
    void triggerHaptic('selection');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const stepMeta = stepMetaList[step - 1];
  const parsedMonthDate = useMemo(() => parseMonthKey(monthLabel), [monthLabel]);
  const headerYear = parsedMonthDate
    ? String(parsedMonthDate.getFullYear())
    : monthLabel.slice(0, 4);
  const localizedMonthLabel = useMemo(() => {
    if (!parsedMonthDate) return monthLabel;
    return parsedMonthDate.toLocaleDateString(activeLocale, {
      month: 'long',
      year: 'numeric',
    });
  }, [activeLocale, monthLabel, parsedMonthDate]);
  const handleBack = step === 1 ? onCancel : back;

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <SettingsHeader
            className="px-0 pt-5 pb-2"
            onBack={handleBack}
            title={stepMeta.title}
            subtitle={stepMeta.subtitle}
          />
          <View style={styles.stepBadgeRow}>
            <Text style={styles.stepEmoji}>{stepMeta.emoji}</Text>
            <Text variant="label" tone="muted" className="uppercase tracking-widest">
              {I18n.t('wage.header_step', { year: headerYear, step })}
            </Text>
          </View>

          <View style={styles.progressRow}>
            {WAGE_FLOW_STEPS.map((index) => (
              <View key={index} className="flex-row items-center">
                <View
                  className={`h-2.5 w-2.5 rounded-full ${step >= index ? 'bg-primary' : 'bg-secondary'}`}
                />
                {index < 5 && (
                  <View className={`h-0.5 w-5 ${step > index ? 'bg-primary' : 'bg-secondary'}`} />
                )}
              </View>
            ))}
          </View>
        </View>

        {step === 1 ? (
          <View>
            <Card>
              <CardContent className="py-5 gap-4">
                <View className="flex-row gap-2">
                  {(['hourly', 'monthly', 'yearly'] as const).map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        void triggerHaptic('selection');
                        setWageType(value);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={wageTypeLabels[value]}
                      className={cn(
                        'flex-1 h-11 rounded-2xl border items-center justify-center',
                        wageType === value
                          ? 'bg-primary border-primary/60'
                          : 'bg-card border-border/60',
                      )}
                    >
                      <Text
                        className={
                          wageType === value ? 'text-primary-foreground' : 'text-foreground'
                        }
                      >
                        {wageTypeLabels[value]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Input
                  label={I18n.t('wage.amount_with_symbol', { symbol: settings.currencySymbol })}
                  variant="currency"
                  currencySymbol={settings.currencySymbol}
                  value={wageAmount}
                  onChangeText={(value) => setWageAmount(sanitizeNonNegativeDecimalInput(value))}
                  placeholder="0"
                  helperText={I18n.t('wage.after_tax_helper')}
                />
              </CardContent>
            </Card>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Card>
              <CardContent className="py-5 gap-4">
                <Input
                  label={I18n.t('wage.hours_per_week')}
                  variant="numeric"
                  value={hoursWorkedPerWeek}
                  onChangeText={(value) =>
                    setHoursWorkedPerWeek(sanitizeNonNegativeDecimalInput(value))
                  }
                  selectTextOnFocus={hoursWorkedPerWeek === '0'}
                  placeholder="40"
                />
                <Input
                  label={I18n.t('wage.workdays_per_week')}
                  variant="numeric"
                  value={workdaysPerWeek}
                  onChangeText={(value) =>
                    setWorkdaysPerWeek(sanitizeNonNegativeDecimalInput(value))
                  }
                  placeholder="5"
                />
              </CardContent>
            </Card>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Card>
              <CardContent className="py-5 gap-4">
                <Input
                  label={I18n.t('wage.commute_minutes')}
                  variant="numeric"
                  value={commuteMinutesPerWorkday}
                  onChangeText={(value) =>
                    setCommuteMinutesPerWorkday(sanitizeNonNegativeDecimalInput(value))
                  }
                  selectTextOnFocus={commuteMinutesPerWorkday === '0'}
                  placeholder="0"
                />
                <View className="rounded-[18px] bg-accent/12 border border-accent/20 px-4 py-3">
                  <Text variant="friendly" tone="muted">
                    {I18n.t('wage.commute_helper')}
                  </Text>
                </View>
              </CardContent>
            </Card>
          </View>
        ) : null}

        {step === 4 ? (
          <View>
            <Card>
              <CardContent className="py-5 gap-3">
                <CalcRow
                  label={I18n.t('wage.weekly_income')}
                  value={formatCurrency(metrics.weeklyIncome, settings.currencySymbol)}
                />
                <CalcRow
                  label={I18n.t('wage.base_hourly_rate')}
                  value={`${formatCurrency(metrics.baseHourlyRate, settings.currencySymbol)}/hr`}
                />
                <CalcRow
                  label={I18n.t('wage.commute_hours_per_week')}
                  value={`${metrics.commuteHoursPerWeek.toFixed(1)}h`}
                />
                <CalcRow
                  label={I18n.t('wage.true_hours_per_week')}
                  value={`${metrics.trueHoursPerWeek.toFixed(1)}h`}
                />
                <View className="mt-1 pt-3 border-t border-border/30">
                  <CalcRow
                    label={I18n.t('wage.true_hourly_rate')}
                    value={`${formatCurrency(metrics.trueHourlyRate, settings.currencySymbol)}/hr`}
                    highlight
                  />
                </View>
              </CardContent>
            </Card>
          </View>
        ) : null}

        {step === 5 ? (
          <View>
            <Card variant="hero">
              <CardContent className="py-7 items-center gap-3">
                <Mascot size={64} mood="proud" animate />
                <Text variant="label" className="text-primary-foreground/70 mt-2">
                  {I18n.t('wage.your_true_hourly_value')}
                </Text>
                <Text variant="hero" className="text-primary-foreground">
                  {formatCurrency(metrics.trueHourlyRate, settings.currencySymbol)} / hour
                </Text>
              </CardContent>
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <SafeAreaView edges={['bottom']} className="border-t border-border/40 bg-background">
        <View style={styles.footerActions}>
          <Button variant="outline" className="flex-1" onPress={handleBack}>
            <Text>{step === 1 ? I18n.t('common.cancel') : I18n.t('common.back')}</Text>
          </Button>
          {step < 5 ? (
            <Button className="flex-1" onPress={next} disabled={!canContinue}>
              <Text>{I18n.t('wage.next')}</Text>
            </Button>
          ) : (
            <Button
              className="flex-1"
              haptic="success"
              onPress={() => {
                onComplete(config);
              }}
            >
              <Text>{I18n.t('wage.save_for_month', { month: localizedMonthLabel })}</Text>
            </Button>
          )}
        </View>
      </SafeAreaView>
    </SettingsPageLayout>
  );
}

function CalcRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="caption" className={highlight ? 'text-primary' : 'text-foreground'}>
        {value}
      </Text>
    </View>
  );
}
