import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
import { Card } from '~/components/ui/card';
import { DisplayModeToggle } from '~/features/transactions/components';
import { EmptyState } from '~/components/feedback/EmptyState';
import { HeroAmountConverter } from '~/features/home/components';
import { useApp } from '~/context/AppContext';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatHours,
} from '~/utils/formatters';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

const GREETINGS: Record<string, string> = {
  morning: I18n.t('home.greeting.morning'),
  afternoon: I18n.t('home.greeting.afternoon'),
  evening: I18n.t('home.greeting.evening'),
};

const WINDOW_MESSAGES = {
  noSpend: [I18n.t('home.window_message.no_spend_1'), I18n.t('home.window_message.no_spend_2')],
  low: [I18n.t('home.window_message.low_1'), I18n.t('home.window_message.low_2')],
  moderate: [I18n.t('home.window_message.moderate_1'), I18n.t('home.window_message.moderate_2')],
  high: [I18n.t('home.window_message.high_1'), I18n.t('home.window_message.high_2')],
};

function formatCadence(pattern: string, interval: number): string {
  if (interval === 1) {
    const labels: Record<string, string> = {
      daily: I18n.t('transactions.editor.daily'),
      weekly: I18n.t('transactions.editor.weekly'),
      monthly: I18n.t('transactions.editor.monthly'),
      yearly: I18n.t('transactions.editor.yearly'),
    };
    return labels[pattern] ?? pattern;
  }
  const plurals: Record<string, string> = {
    daily: 'days',
    weekly: 'weeks',
    monthly: 'months',
    yearly: 'years',
  };
  return I18n.t('recurring.every_pattern', {
    interval: String(interval),
    pattern: plurals[pattern] ?? pattern,
  });
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getWindowMessage(hoursSpent: number): string {
  let bucket: keyof typeof WINDOW_MESSAGES;
  if (hoursSpent <= 0) bucket = 'noSpend';
  else if (hoursSpent < 1) bucket = 'low';
  else if (hoursSpent < 20) bucket = 'moderate';
  else bucket = 'high';

  const messages = WINDOW_MESSAGES[bucket];
  const dayIndex = new Date().getDate() % messages.length;
  return messages[dayIndex];
}

function BlinkingDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: 1200 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color,
    marginRight: 6,
  }));

  return <Animated.View style={style} />;
}

function SummaryMetric({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'success' | 'destructive';
}) {
  const valueToneClass = {
    success: 'text-success',
    destructive: 'text-destructive',
  };
  return (
    <View className="flex-1 rounded-xl border border-border/30 bg-card px-3 py-2.5">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="bodyStrong" className={`mt-1 ${valueToneClass[variant]}`}>
        {value}
      </Text>
    </View>
  );
}

export function HomeScreen() {
  const themeColors = useThemeColors();
  const {
    transactions,
    recurringRules,
    categories,
    settings,
    currentMonthWage,
    getDisplayValueForTransaction,
  } = useApp();

  const todayIso = dayKeyFromDateLocal(new Date());
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const windowStartIso = dayKeyFromDateLocal(thirtyDaysAgo);
  const rate = currentMonthWage?.trueHourlyRate ?? 0;
  const hasHourlyRate = rate > 0;
  const isTimeMode = settings.displayMode === 'time';
  const [estimatorAmount, setEstimatorAmount] = useState('');

  const windowStats = useMemo(() => {
    const windowTxns = transactions.filter((tx) => {
      const day = dayKeyFromIsoLocal(tx.date);
      return day >= windowStartIso && day <= todayIso;
    });
    let income = 0;
    let expense = 0;

    windowTxns.forEach((tx) => {
      const hoursValue = getDisplayValueForTransaction(tx);
      if (tx.type === 'income') income += hoursValue;
      if (tx.type === 'expense') expense += hoursValue;
    });

    return { income, expense, count: windowTxns.length };
  }, [getDisplayValueForTransaction, transactions, todayIso, windowStartIso]);

  const recurringInsights = useMemo(() => {
    const monthlyFactor = (
      pattern: 'daily' | 'weekly' | 'monthly' | 'yearly',
      interval: number,
    ) => {
      const safeInterval = Math.max(1, interval);
      switch (pattern) {
        case 'daily':
          return 30 / safeInterval;
        case 'weekly':
          return 30 / (7 * safeInterval);
        case 'yearly':
          return 1 / (12 * safeInterval);
        case 'monthly':
        default:
          return 1 / safeInterval;
      }
    };

    return recurringRules
      .filter((rule) => rule.type === 'expense')
      .map((rule) => {
        const factor = monthlyFactor(rule.recurrencePattern, rule.recurrenceInterval);
        const monthlyAmount = rule.amount * factor;
        return {
          ...rule,
          monthlyAmount,
          monthlyHours: hasHourlyRate
            ? amountToHoursByRate(monthlyAmount, rate, settings.hourRounding)
            : 0,
        };
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return Math.abs(b.monthlyAmount) - Math.abs(a.monthlyAmount);
      });
  }, [hasHourlyRate, rate, recurringRules, settings.hourRounding]);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const activeRecurringInsights = useMemo(
    () => recurringInsights.filter((item) => item.isActive),
    [recurringInsights],
  );

  const recurringTotalMonthlyAmount = useMemo(
    () => activeRecurringInsights.reduce((sum, item) => sum + item.monthlyAmount, 0),
    [activeRecurringInsights],
  );
  const recurringTotalMonthlyHours = useMemo(
    () => activeRecurringInsights.reduce((sum, item) => sum + item.monthlyHours, 0),
    [activeRecurringInsights],
  );

  const avgDailySpend = windowStats.expense / 30;
  const spentHoursForMessaging = isTimeMode
    ? windowStats.expense
    : hasHourlyRate
      ? amountToHoursByRate(windowStats.expense, rate, settings.hourRounding)
      : 0;

  const greeting = GREETINGS[getTimeOfDay()];
  const windowMessage = hasHourlyRate
    ? getWindowMessage(spentHoursForMessaging)
    : I18n.t('home.window_message.no_rate');

  const formatSignedValue = (val: number, isIncome: boolean) => {
    if (isTimeMode) return `${val > 0 ? '+' : val < 0 ? '-' : ''}${formatHours(Math.abs(val))}`;
    return formatAmount(val, settings, { showSign: true, isIncome });
  };
  const estimatorNumeric = Number(estimatorAmount) || 0;
  const estimatorHours = hasHourlyRate
    ? amountToHoursByRate(estimatorNumeric, rate, settings.hourRounding)
    : 0;
  const estimatorWorkdays = estimatorHours / 8;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View className="px-5 pt-5 pb-2 flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text variant="heading">{greeting}</Text>
            <Text variant="friendly" tone="muted" className="mt-1">
              {isTimeMode ? I18n.t('home.day_mode.time') : I18n.t('home.day_mode.money')}
            </Text>
          </View>
          <DisplayModeToggle />
        </View>

        <Animated.View entering={FadeIn.delay(80).duration(400)}>
          <HeroAmountConverter
            amount={estimatorAmount}
            currencySymbol={settings.currencySymbol}
            hasRate={hasHourlyRate}
            hours={estimatorHours}
            workdays={estimatorWorkdays}
            onChangeAmount={setEstimatorAmount}
          />
        </Animated.View>

        {/* Hero Card */}
        <Animated.View entering={FadeIn.duration(500).springify()} className="mx-5 mt-3">
          <Card variant="default" className="px-4 py-4">
            <Text variant="label" tone="muted">
              {I18n.t('home.last_30_days_spent')}
            </Text>
            <Text variant="hero" className="mt-1">
              {isTimeMode
                ? formatHours(Math.abs(windowStats.expense))
                : formatAmount(windowStats.expense, settings, { showSign: false })}
            </Text>
            {windowStats.expense > 0 ? (
              <Text variant="caption" tone="muted" className="mt-1">
                {isTimeMode
                  ? I18n.t('home.avg_per_day_transactions', {
                      value: formatHours(avgDailySpend),
                      count: windowStats.count,
                    })
                  : I18n.t('home.avg_per_day_transactions', {
                      value: formatAmount(avgDailySpend, settings, { showSign: false }),
                      count: windowStats.count,
                    })}
              </Text>
            ) : null}

            <View className="mt-3 flex-row gap-2">
              <SummaryMetric
                label={I18n.t('transactions.filters.earned')}
                value={formatSignedValue(windowStats.income, true)}
                variant="success"
              />
              <SummaryMetric
                label={I18n.t('transactions.filters.spent')}
                value={formatSignedValue(windowStats.expense, false)}
                variant="destructive"
              />
            </View>

            <View className="mt-3 rounded-xl bg-secondary/55 px-3 py-2.5">
              <Text variant="label" tone="muted">
                {windowMessage}
              </Text>
            </View>
          </Card>
        </Animated.View>

        {/* Recurring Commitments */}
        <Animated.View entering={FadeIn.delay(320).duration(400)} className="mt-7 px-5">
          {/* Section header with summary pill */}
          <View className="flex-row items-center justify-between mb-3">
            <Text variant="subheading">{I18n.t('home.recurring.title')}</Text>
            {activeRecurringInsights.length > 0 && (
              <View className="bg-destructive/10 rounded-full px-3 py-1">
                <Text variant="caption" className="text-destructive">
                  {isTimeMode
                    ? formatHours(recurringTotalMonthlyHours)
                    : formatAmount(recurringTotalMonthlyAmount, settings, { showSign: false })}
                  {I18n.t('home.recurring.per_month')}
                </Text>
              </View>
            )}
          </View>

          {recurringInsights.length > 0 ? (
            <Card variant="default" className="p-0 overflow-hidden">
              {recurringInsights.map((rule, index) => {
                const category = rule.categoryId ? categoryById.get(rule.categoryId) : undefined;
                const isLast = index === recurringInsights.length - 1;
                return (
                  <Animated.View
                    key={rule.id}
                    entering={FadeIn.delay(380 + index * 60).duration(350)}
                  >
                    <View
                      className={`flex-row items-center px-4 py-3 ${!isLast ? 'border-b border-border/15' : ''}`}
                      style={!rule.isActive ? { opacity: 0.45 } : undefined}
                    >
                      <View
                        className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                        style={{ backgroundColor: (category?.color ?? themeColors.primary) + '18' }}
                      >
                        <Text style={{ fontSize: 18 }}>{category?.icon ?? '🔄'}</Text>
                      </View>
                      <View className="flex-1 mr-2">
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {rule.name}
                        </Text>
                        <View className="flex-row items-center mt-0.5">
                          {rule.isActive ? (
                            <BlinkingDot color={themeColors.success} />
                          ) : (
                            <View
                              className="w-1.5 h-1.5 rounded-full mr-1.5"
                              style={{ backgroundColor: themeColors.textMuted }}
                            />
                          )}
                          <Text variant="label" tone="muted">
                            {formatCadence(rule.recurrencePattern, rule.recurrenceInterval)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        variant="caption"
                        className={rule.isActive ? 'text-destructive' : 'text-muted-foreground'}
                      >
                        {isTimeMode
                          ? formatHours(rule.monthlyHours)
                          : formatAmount(rule.monthlyAmount, settings, { showSign: false })}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })}
            </Card>
          ) : (
            <EmptyState
              title={I18n.t('home.recurring.none_title')}
              message={I18n.t('home.recurring.none_message')}
              mascotMood="curious"
            />
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
