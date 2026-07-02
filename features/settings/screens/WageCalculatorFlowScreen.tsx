import { BarChart2, ChevronLeft, Clock3, Timer, Wallet } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import {
  Button,
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { UserSettings, WageConfig, WageType } from '~/types';
import { cn } from '~/utils';
import { FONT } from '~/utils/fonts';
import { computeHourlyRates, formatCurrency, parseMonthKey } from '~/utils/formatters';

interface WageCalculatorFlowScreenProps {
  initialConfig: WageConfig;
  settings: UserSettings;
  monthLabel: string;
  onCancel: () => void;
  onComplete: (config: WageConfig) => void;
}

const WAGE_FLOW_STEPS = [1, 2, 3, 4] as const;

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  topRow: {
    paddingTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  monthPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
  heroHeader: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  stepIconShell: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  progressRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressConnector: {
    width: 26,
    height: 2,
    borderRadius: 999,
    marginHorizontal: spacing.xs,
  },
  formSection: {
    marginTop: spacing.xl,
  },
  fieldContainer: {
    width: '100%',
  },
  fieldShell: {
    borderRadius: 22,
    borderWidth: 1,
    height: 54,
    paddingHorizontal: spacing.md,
  },
  fieldInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 52,
  },
  fieldInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    fontFamily: FONT.medium,
    fontWeight: '500',
  },
  dismissSpacer: {
    height: spacing.xl,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  resultCard: {
    marginTop: spacing.md,
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

interface WageInputFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  helperText?: string;
  currencySymbol?: string;
}

function WageInputField({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  currencySymbol,
}: WageInputFieldProps) {
  const themeColors = useThemeColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldContainer}>
      <View className="mb-2.5 px-1 flex-row items-center">
        <Text variant="label" tone="muted">
          {label}
        </Text>
      </View>
      <View
        style={[
          styles.fieldShell,
          {
            backgroundColor: focused ? `${themeColors.primary}0A` : themeColors.card,
            borderColor: focused ? `${themeColors.primary}66` : `${themeColors.border}66`,
          },
        ]}
      >
        <View style={styles.fieldInputRow}>
          {currencySymbol ? (
            <Text variant="bodyStrong" className="mr-2 text-muted-foreground">
              {currencySymbol}
            </Text>
          ) : null}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor={themeColors.textMuted}
            style={[SINGLE_LINE_TEXT_INPUT_STYLE, styles.fieldInput, { color: themeColors.text }]}
          />
        </View>
      </View>
      {helperText ? (
        <Text variant="caption" tone="muted" className="mt-2 px-1">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

export function WageCalculatorFlowScreen({
  initialConfig,
  settings,
  monthLabel,
  onCancel,
  onComplete,
}: WageCalculatorFlowScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  // When the floating glass nav bar overlays the shell (iOS 26+), lift the
  // pinned footer above it so the Save button isn't hidden behind the bar.
  // Zero in fallback/classic mode, where the bar sits below content in flow.
  const footerNavInset = useBottomNavContentInset();
  const hasFloatingNav = footerNavInset > 0;
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const [step, setStep] = useState<(typeof WAGE_FLOW_STEPS)[number]>(1);
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
      { title: I18n.t('wage.step_1_title'), Icon: Wallet },
      { title: I18n.t('wage.step_2_title'), Icon: Clock3 },
      { title: I18n.t('wage.step_3_title'), Icon: Timer },
      { title: I18n.t('wage.step_4_title'), Icon: BarChart2 },
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

  const parsedMonthDate = useMemo(() => parseMonthKey(monthLabel), [monthLabel]);
  const localizedMonthLabel = useMemo(() => {
    if (!parsedMonthDate) return monthLabel;
    return parsedMonthDate.toLocaleDateString(activeLocale, {
      month: 'long',
      year: 'numeric',
    });
  }, [activeLocale, monthLabel, parsedMonthDate]);

  const next = () => {
    Keyboard.dismiss();
    setStep((previous) => {
      const nextStep = Math.min(previous + 1, WAGE_FLOW_STEPS.length);
      return WAGE_FLOW_STEPS[nextStep - 1] ?? previous;
    });
  };
  const back = () => {
    Keyboard.dismiss();
    setStep((previous) => {
      const nextStep = Math.max(previous - 1, 1);
      return WAGE_FLOW_STEPS[nextStep - 1] ?? previous;
    });
  };
  const handleBack = () => {
    Keyboard.dismiss();
    if (step === 1) {
      onCancel();
      return;
    }
    back();
  };

  const stepMeta = stepMetaList[step - 1];
  const StepIcon = stepMeta?.Icon ?? Wallet;

  return (
    <SettingsPageLayout>
      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? I18n.t('common.cancel') : I18n.t('common.back')}
            style={[
              styles.headerButton,
              {
                borderColor: `${themeColors.border}55`,
                backgroundColor: themeColors.card,
              },
            ]}
          >
            <ChevronLeft size={18} color={themeColors.textMuted} />
          </Pressable>

          <View
            style={[
              styles.monthPill,
              {
                borderColor: `${themeColors.border}45`,
                backgroundColor: themeColors.card,
              },
            ]}
          >
            <Text variant="label" tone="muted">
              {localizedMonthLabel}
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroHeader}>
          <View
            style={[
              styles.stepIconShell,
              {
                backgroundColor: `${themeColors.primary}10`,
                borderColor: `${themeColors.primary}20`,
              },
            ]}
          >
            <StepIcon size={28} color={themeColors.primary} />
          </View>

          <View style={styles.progressRow}>
            {WAGE_FLOW_STEPS.map((index) => {
              const isActive = step >= index;
              return (
                <View key={index} className="flex-row items-center">
                  <View
                    className="rounded-full"
                    style={{
                      width: isActive ? 10 : 8,
                      height: isActive ? 10 : 8,
                      backgroundColor: isActive
                        ? themeColors.primary
                        : `${themeColors.backgroundSubtle}99`,
                    }}
                  />
                  {index < WAGE_FLOW_STEPS.length ? (
                    <View
                      style={[
                        styles.progressConnector,
                        {
                          backgroundColor:
                            step > index
                              ? `${themeColors.primary}66`
                              : `${themeColors.backgroundSubtle}66`,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>

          <Text variant="title" className="mt-5 text-center text-foreground">
            {stepMeta?.title}
          </Text>
        </View>

        <View style={styles.formSection}>
          {step === 1 ? (
            <Card className="overflow-hidden">
              <CardContent className="py-5 gap-4">
                <View className="rounded-[24px] border border-border/25 bg-secondary/35 p-1 flex-row gap-1">
                  {(['hourly', 'monthly', 'yearly'] as const).map((value) => {
                    const isSelected = wageType === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => {
                          Keyboard.dismiss();
                          void triggerHaptic('selection');
                          setWageType(value);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={wageTypeLabels[value]}
                        className={cn(
                          'flex-1 h-11 rounded-[18px] items-center justify-center',
                          isSelected ? 'bg-primary' : 'bg-transparent',
                        )}
                      >
                        <Text
                          className={isSelected ? 'text-primary-foreground' : 'text-foreground'}
                        >
                          {wageTypeLabels[value]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <WageInputField
                  label={I18n.t('wage.amount_with_symbol', { symbol: settings.currencySymbol })}
                  currencySymbol={settings.currencySymbol}
                  value={wageAmount}
                  onChangeText={(value) => setWageAmount(sanitizeNonNegativeDecimalInput(value))}
                  placeholder="0"
                  helperText={I18n.t('wage.after_tax_helper')}
                />
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card className="overflow-hidden">
              <CardContent className="py-5 gap-4">
                <WageInputField
                  label={I18n.t('wage.hours_per_week')}
                  value={hoursWorkedPerWeek}
                  onChangeText={(value) =>
                    setHoursWorkedPerWeek(sanitizeNonNegativeDecimalInput(value))
                  }
                  placeholder="40"
                />
                <WageInputField
                  label={I18n.t('wage.workdays_per_week')}
                  value={workdaysPerWeek}
                  onChangeText={(value) =>
                    setWorkdaysPerWeek(sanitizeNonNegativeDecimalInput(value))
                  }
                  placeholder="5"
                />
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card className="overflow-hidden">
              <CardContent className="py-5 gap-4">
                <WageInputField
                  label={I18n.t('wage.commute_minutes')}
                  value={commuteMinutesPerWorkday}
                  onChangeText={(value) =>
                    setCommuteMinutesPerWorkday(sanitizeNonNegativeDecimalInput(value))
                  }
                  placeholder="0"
                  helperText={I18n.t('wage.commute_helper')}
                />
              </CardContent>
            </Card>
          ) : null}

          {step === 4 ? (
            <View>
              <Card variant="hero" className="overflow-hidden">
                <CardContent className="py-7 items-center">
                  <View
                    className="absolute -top-10 -left-10 h-28 w-28 rounded-full"
                    style={{ backgroundColor: '#fff', opacity: 0.06 }}
                  />
                  <Text variant="label" tone="inverse" className="tracking-widest opacity-70">
                    {I18n.t('wage.true_hourly_rate')}
                  </Text>
                  <Text variant="hero" tone="inverse" className="mt-3">
                    {formatCurrency(metrics.trueHourlyRate, settings.currencySymbol)}
                  </Text>
                </CardContent>
              </Card>

              <Card className="overflow-hidden" style={styles.resultCard}>
                <CardContent className="py-5 gap-3.5">
                  <CalcRow
                    label={I18n.t('wage.weekly_income')}
                    value={formatCurrency(metrics.weeklyIncome, settings.currencySymbol)}
                  />
                  <CalcRow
                    label={I18n.t('wage.base_hourly_rate')}
                    value={`${formatCurrency(metrics.baseHourlyRate, settings.currencySymbol)}/hr`}
                  />
                  <CalcRow
                    label={I18n.t('wage.hours_per_week')}
                    value={`${config.hoursWorkedPerWeek.toFixed(1)}h`}
                  />
                  <CalcRow
                    label={I18n.t('wage.commute_hours_per_week')}
                    value={`${metrics.commuteHoursPerWeek.toFixed(1)}h`}
                  />
                  <CalcRow
                    label={I18n.t('wage.true_hours_per_week')}
                    value={`${metrics.trueHoursPerWeek.toFixed(1)}h`}
                  />
                </CardContent>
              </Card>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={Keyboard.dismiss}
          accessible={false}
          style={styles.dismissSpacer}
          pointerEvents="box-only"
        />
      </ScrollView>

      <SafeAreaView
        edges={hasFloatingNav ? [] : ['bottom']}
        className="border-t border-border/25 bg-background"
        style={hasFloatingNav ? { marginBottom: footerNavInset } : undefined}
      >
        <View style={styles.footerActions}>
          <Button variant="outline" className="flex-1" haptic="selection" onPress={handleBack}>
            <Text>{step === 1 ? I18n.t('common.cancel') : I18n.t('common.back')}</Text>
          </Button>
          {step < WAGE_FLOW_STEPS.length ? (
            <Button className="flex-1" haptic="selection" onPress={next} disabled={!canContinue}>
              <Text>{I18n.t('wage.next')}</Text>
            </Button>
          ) : (
            <Button
              className="flex-1"
              haptic="success"
              onPress={() => {
                Keyboard.dismiss();
                onComplete(config);
              }}
            >
              <Text>{I18n.t('common.save')}</Text>
            </Button>
          )}
        </View>
      </SafeAreaView>
    </SettingsPageLayout>
  );
}

function CalcRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="caption" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="caption" className="text-foreground">
        {value}
      </Text>
    </View>
  );
}
