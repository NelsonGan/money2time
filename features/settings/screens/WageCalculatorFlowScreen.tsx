import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
} from '~/components/ui/settings';
import { Text } from '~/components/ui/text';
import { Mascot } from '~/components/feedback/Mascot';
import { computeHourlyRates, formatCurrency } from '~/utils/formatters';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import type { WageConfig, WageType, UserSettings } from '~/types';
import { I18n } from '~/lib/i18n';

interface WageCalculatorFlowScreenProps {
  initialConfig: WageConfig;
  settings: UserSettings;
  monthLabel: string;
  onCancel: () => void;
  onComplete: (config: WageConfig) => void;
}

const STEP_META = [
  { emoji: '💰', title: I18n.t('wage.step_1_title'), subtitle: I18n.t('wage.step_1_subtitle') },
  { emoji: '📅', title: I18n.t('wage.step_2_title'), subtitle: I18n.t('wage.step_2_subtitle') },
  { emoji: '🚗', title: I18n.t('wage.step_3_title'), subtitle: I18n.t('wage.step_3_subtitle') },
  { emoji: '🧮', title: I18n.t('wage.step_4_title'), subtitle: I18n.t('wage.step_4_subtitle') },
  { emoji: '✨', title: I18n.t('wage.step_5_title'), subtitle: I18n.t('wage.step_5_subtitle') },
];

const WAGE_TYPE_LABELS: Record<WageType, string> = {
  hourly: I18n.t('wage.type.hourly'),
  monthly: I18n.t('wage.type.monthly'),
  yearly: I18n.t('wage.type.yearly'),
};

export function WageCalculatorFlowScreen({
  initialConfig,
  settings,
  monthLabel,
  onCancel,
  onComplete,
}: WageCalculatorFlowScreenProps) {
  const [step, setStep] = useState(1);
  const [wageType, setWageType] = useState<WageType>(initialConfig.wageType);
  const [wageAmount, setWageAmount] = useState(String(initialConfig.wageAmount || ''));
  const [hoursWorkedPerWeek, setHoursWorkedPerWeek] = useState(
    String(initialConfig.hoursWorkedPerWeek),
  );
  const [workdaysPerWeek, setWorkdaysPerWeek] = useState(String(initialConfig.workdaysPerWeek));
  const [commuteMinutesPerWorkday, setCommuteMinutesPerWorkday] = useState(
    String(initialConfig.commuteMinutesPerWorkday),
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

  const stepMeta = STEP_META[step - 1];
  const headerYear = monthLabel.slice(0, 4);
  const handleBack = step === 1 ? onCancel : back;

  return (
    <SettingsPageLayout>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
        }}
      >
        <View className="mb-5">
          <SettingsHeader
            className="px-0 pt-5 pb-2"
            onBack={handleBack}
            title={stepMeta.title}
            subtitle={stepMeta.subtitle}
          />
          <View className="mt-1 flex-row items-center gap-2 px-1">
            <Text style={{ fontSize: 24 }}>{stepMeta.emoji}</Text>
            <Text variant="label" tone="muted" className="uppercase tracking-widest">
              {I18n.t('wage.header_step', { year: headerYear, step })}
            </Text>
          </View>

          <View className="mt-4 flex-row items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((index) => (
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
                      className={cn(
                        'flex-1 h-10 rounded-2xl border items-center justify-center',
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
                        {WAGE_TYPE_LABELS[value]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Input
                  label={I18n.t('wage.amount_with_symbol', { symbol: settings.currencySymbol })}
                  variant="currency"
                  currencySymbol={settings.currencySymbol}
                  value={wageAmount}
                  onChangeText={setWageAmount}
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
                  onChangeText={setHoursWorkedPerWeek}
                  selectTextOnFocus={hoursWorkedPerWeek === '0'}
                  placeholder="40"
                />
                <Input
                  label={I18n.t('wage.workdays_per_week')}
                  variant="numeric"
                  value={workdaysPerWeek}
                  onChangeText={setWorkdaysPerWeek}
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
                  onChangeText={setCommuteMinutesPerWorkday}
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
        <View className="flex-row gap-2.5 px-5 pb-3 pt-3">
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
                void triggerHaptic('success');
                onComplete(config);
              }}
            >
              <Text>{I18n.t('wage.save_for_month', { month: monthLabel })}</Text>
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
