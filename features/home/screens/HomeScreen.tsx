import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Card, Text } from '~/components/ui';
import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { HeroAmountConverter } from '~/features/home/components';
import { AccountsScreen } from '~/features/settings/screens';
import { DisplayModeToggle } from '~/features/transactions/components';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { amountToHoursByRate, formatAmount, formatHours } from '~/utils/formatters';

const GREETINGS: Record<string, string> = {
  morning: I18n.t('home.greeting.morning'),
  afternoon: I18n.t('home.greeting.afternoon'),
  evening: I18n.t('home.greeting.evening'),
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

// Underline-style tab bar
function HomeTabs({
  tabs,
  activeIndex,
  onTabChange,
}: {
  tabs: string[];
  activeIndex: number;
  onTabChange: (index: number) => void;
}) {
  const themeColors = useThemeColors();
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth > 0 ? barWidth / tabs.length : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (tabWidth <= 0) return;
    indicatorX.value = withTiming(activeIndex * tabWidth, { duration: 220 });
  }, [activeIndex, tabWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: tabWidth,
  }));

  return (
    <View
      className="border-b border-border/30"
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      <View className="flex-row">
        {tabs.map((label, index) => (
          <Pressable
            key={label}
            onPress={() => {
              void triggerHaptic('selection');
              onTabChange(index);
            }}
            className="flex-1 py-3 items-center active:opacity-70"
          >
            <Text
              variant="bodyStrong"
              className={cn(activeIndex === index ? 'text-foreground' : 'text-muted-foreground')}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View
        style={[
          indicatorStyle,
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 2,
            backgroundColor: themeColors.primary,
            borderRadius: 1,
          },
        ]}
      />
    </View>
  );
}

interface HomeScreenProps {
  scrollToTopToken?: number;
  onOpenAccount?: (accountId: string) => void;
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
}

export function HomeScreen({
  scrollToTopToken = 0,
  onOpenAccount,
  onOpenTransaction,
}: HomeScreenProps = {}) {
  const themeColors = useThemeColors();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const pagerRef = useRef<ScrollView | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const {
    recurringRules,
    categories,
    settings,
    currentMonthWage,
    isSimpleMode,
    simpleWalletId,
  } = useApp();

  const [activeHomeTabIndex, setActiveHomeTabIndex] = useState(0);
  const [estimatorAmount, setEstimatorAmount] = useState('');

  // Reset to overview if on accounts tab when entering simple mode
  useEffect(() => {
    if (isSimpleMode && activeHomeTabIndex === 2) {
      setActiveHomeTabIndex(0);
      pagerRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [isSimpleMode, activeHomeTabIndex]);

  const homeTabs = useMemo(() => {
    const base = [I18n.t('nav.home'), I18n.t('home.recurring.tab')];
    if (!isSimpleMode) base.push(I18n.t('nav.account'));
    return base;
  }, [isSimpleMode]);

  const switchTab = useCallback(
    (index: number) => {
      void triggerHaptic('selection');
      setActiveHomeTabIndex(index);
      pagerRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    },
    [screenWidth],
  );

  const handlePagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      setActiveHomeTabIndex(Math.round(x / screenWidth));
    },
    [screenWidth],
  );


  const walletRecurringRules = useMemo(() => {
    if (!isSimpleMode || !simpleWalletId) return recurringRules;
    return recurringRules.filter(
      (rule) =>
        rule.accountId === simpleWalletId ||
        rule.fromAccountId === simpleWalletId ||
        rule.toAccountId === simpleWalletId,
    );
  }, [recurringRules, isSimpleMode, simpleWalletId]);

  const rate = currentMonthWage?.trueHourlyRate ?? 0;
  const hasHourlyRate = rate > 0;
  const isTimeMode = settings.displayMode === 'time';

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

    return walletRecurringRules
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
  }, [hasHourlyRate, rate, walletRecurringRules, settings.hourRounding]);

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

  const estimatorNumeric = Number(estimatorAmount) || 0;
  const estimatorHours = hasHourlyRate
    ? amountToHoursByRate(estimatorNumeric, rate, settings.hourRounding)
    : 0;
  const estimatorWorkdays = estimatorHours / 8;
  const estimatorWorkdaysPerWeek = Math.max(1, currentMonthWage?.workdaysPerWeek ?? 5);

  const greeting = GREETINGS[getTimeOfDay()];

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToTopToken]);

  // ── Overview page ──────────────────────────────────────────────────────────
  const overviewContent = (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: LIST_BOTTOM_PADDING }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
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
          workdaysPerWeek={estimatorWorkdaysPerWeek}
          onChangeAmount={setEstimatorAmount}
        />
      </Animated.View>
    </ScrollView>
  );

  // ── Recurring page ─────────────────────────────────────────────────────────
  const recurringContent = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: LIST_BOTTOM_PADDING }}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View className="flex-row items-center justify-between mt-5 mb-3">
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
            const parentCategory = category?.parentId
              ? categoryById.get(category.parentId)
              : undefined;
            const categoryIcon = category
              ? resolveCategoryIcon(category.icon, parentCategory?.icon ?? null)
              : '🔄';
            const isLast = index === recurringInsights.length - 1;
            return (
              <Animated.View
                key={rule.id}
                entering={FadeIn.delay(index * 60).duration(350)}
              >
                <View
                  className={`flex-row items-center px-4 py-3 ${!isLast ? 'border-b border-border/15' : ''}`}
                  style={!rule.isActive ? { opacity: 0.45 } : undefined}
                >
                  <View
                    className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                    style={{ backgroundColor: themeColors.primary + '18' }}
                  >
                    <Text style={{ fontSize: 18 }}>{categoryIcon}</Text>
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
    </ScrollView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <HomeTabs tabs={homeTabs} activeIndex={activeHomeTabIndex} onTabChange={switchTab} />

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        directionalLockEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePagerScrollEnd}
        decelerationRate="fast"
        style={{ flex: 1 }}
      >
        <View style={{ width: screenWidth, flex: 1 }}>{overviewContent}</View>
        <View style={{ width: screenWidth, flex: 1 }}>{recurringContent}</View>
        {!isSimpleMode && (
          <View style={{ width: screenWidth, flex: 1 }}>
            <AccountsScreen
              safeAreaEdges={[]}
              onOpenAccount={onOpenAccount}
              onOpenTransaction={onOpenTransaction}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
