import { Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Button, Card, Text } from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
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
import { filterRecurringRulesByWallet } from '~/utils/recurringRules';

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

interface RecurringDisplayRow {
  id: string;
  name: string;
  isActive: boolean;
  cadenceLabel: string;
  categoryIcon: string;
  valueLabel: string;
}

function RecurringRuleRow({
  item,
  isLast,
  themeColors,
}: {
  item: RecurringDisplayRow;
  isLast: boolean;
  themeColors: { primary: string; success: string; textMuted: string; border: string };
}) {
  const iconBackgroundStyle = useMemo(
    () => ({ backgroundColor: `${themeColors.primary}18` }),
    [themeColors.primary],
  );
  const dividerStyle = useMemo(
    () => ({ borderBottomColor: themeColors.border }),
    [themeColors.border],
  );
  const inactiveDotStyle = useMemo(
    () => ({ backgroundColor: themeColors.textMuted }),
    [themeColors.textMuted],
  );

  return (
    <View
      style={[
        styles.recurringRow,
        !isLast ? styles.recurringRowDivider : null,
        !isLast ? dividerStyle : null,
        !item.isActive ? styles.recurringRowInactive : null,
      ]}
    >
      <View style={[styles.recurringIconWrap, iconBackgroundStyle]}>
        <Text style={styles.recurringIconText}>{item.categoryIcon}</Text>
      </View>
      <View style={styles.recurringTextWrap}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.recurringCadenceRow}>
          {item.isActive ? (
            <BlinkingDot color={themeColors.success} />
          ) : (
            <View style={[styles.recurringStaticDot, inactiveDotStyle]} />
          )}
          <Text variant="label" tone="muted">
            {item.cadenceLabel}
          </Text>
        </View>
      </View>
      <Text
        variant="caption"
        className={item.isActive ? 'text-destructive' : 'text-muted-foreground'}
        numberOfLines={1}
      >
        {item.valueLabel}
      </Text>
    </View>
  );
}

// Underline-style tab bar
function HomeTabs({
  tabs,
  activeIndex,
  pagerOffsetX,
  pagerWidth,
  onTabChange,
}: {
  tabs: string[];
  activeIndex: number;
  pagerOffsetX: SharedValue<number>;
  pagerWidth: number;
  onTabChange: (index: number) => void;
}) {
  const themeColors = useThemeColors();
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth > 0 ? barWidth / tabs.length : 0;
  const tabsBorderStyle = useMemo(
    () => ({ borderBottomColor: themeColors.border }),
    [themeColors.border],
  );
  const indicatorColorStyle = useMemo(
    () => ({ backgroundColor: themeColors.primary }),
    [themeColors.primary],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          tabWidth > 0 && pagerWidth > 0
            ? Math.max(
                0,
                Math.min((pagerOffsetX.value / pagerWidth) * tabWidth, tabWidth * (tabs.length - 1)),
              )
            : activeIndex * tabWidth,
      },
    ],
    width: tabWidth,
  }));

  return (
    <View
      style={[styles.tabsContainer, tabsBorderStyle]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.tabsRow}>
        {tabs.map((label, index) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: activeIndex === index }}
            onPress={() => {
              void triggerHaptic('selection');
              onTabChange(index);
            }}
            style={styles.tabPressable}
            className="active:opacity-70"
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
      <Animated.View style={[styles.tabIndicator, indicatorStyle, indicatorColorStyle]} />
    </View>
  );
}

interface HomeScreenProps {
  scrollToTopToken?: number;
  onOpenAccount?: (accountId: string) => void;
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
  onOpenSettingsScreen?: (screen: 'Accounts' | 'Recurring') => void;
}

export function HomeScreen({
  scrollToTopToken = 0,
  onOpenAccount,
  onOpenTransaction,
  onOpenSettingsScreen,
}: HomeScreenProps = {}) {
  const themeColors = useThemeColors();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const pagerRef = useRef<ScrollView | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const { recurringRules, categories, settings, currentMonthWage, isSimpleMode, simpleWalletId } =
    useApp();

  // Power mode: Accounts(0), Home(1), Recurring(2) — default center (1)
  // Simple mode: Home(0), Recurring(1) — default (0)
  const defaultTabIndex = isSimpleMode ? 0 : 1;
  const [activeHomeTabIndex, setActiveHomeTabIndex] = useState(defaultTabIndex);
  const pagerOffsetX = useSharedValue(defaultTabIndex * screenWidth);
  const [estimatorAmount, setEstimatorAmount] = useState('');

  // Reset to home if on out-of-range tab when entering simple mode
  useEffect(() => {
    if (isSimpleMode && activeHomeTabIndex > 1) {
      setActiveHomeTabIndex(0);
      pagerOffsetX.value = 0;
      pagerRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [activeHomeTabIndex, isSimpleMode, pagerOffsetX]);

  const homeTabs = useMemo(() => {
    if (isSimpleMode) return [I18n.t('nav.home'), I18n.t('home.recurring.tab')];
    return [I18n.t('nav.account'), I18n.t('nav.home'), I18n.t('home.recurring.tab')];
  }, [isSimpleMode]);

  const switchTab = useCallback(
    (index: number) => {
      setActiveHomeTabIndex(index);
      pagerRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    },
    [screenWidth],
  );

  const handlePagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      pagerOffsetX.value = x;
      setActiveHomeTabIndex(Math.round(x / screenWidth));
    },
    [pagerOffsetX, screenWidth],
  );

  const handlePagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      pagerOffsetX.value = x;
      const nextIndex = Math.round(x / screenWidth);
      setActiveHomeTabIndex((prev) => (prev === nextIndex ? prev : nextIndex));
    },
    [pagerOffsetX, screenWidth],
  );

  const walletRecurringRules = useMemo(() => {
    if (!isSimpleMode) return recurringRules;
    return filterRecurringRulesByWallet(recurringRules, simpleWalletId);
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

    const next: Array<
      (typeof walletRecurringRules)[number] & { monthlyAmount: number; monthlyHours: number }
    > = [];
    walletRecurringRules.forEach((rule) => {
      if (rule.type !== 'expense') return;
      const factor = monthlyFactor(rule.recurrencePattern, rule.recurrenceInterval);
      const monthlyAmount = rule.amount * factor;
      next.push({
        ...rule,
        monthlyAmount,
        monthlyHours: hasHourlyRate
          ? amountToHoursByRate(monthlyAmount, rate, settings.hourRounding)
          : 0,
      });
    });
    next.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return Math.abs(b.monthlyAmount) - Math.abs(a.monthlyAmount);
    });
    return next;
  }, [hasHourlyRate, rate, walletRecurringRules, settings.hourRounding]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const estimatorNumeric = useMemo(() => Number(estimatorAmount) || 0, [estimatorAmount]);
  const estimatorHours = useMemo(
    () => (hasHourlyRate ? amountToHoursByRate(estimatorNumeric, rate, settings.hourRounding) : 0),
    [estimatorNumeric, hasHourlyRate, rate, settings.hourRounding],
  );
  const estimatorWorkdays = useMemo(() => estimatorHours / 8, [estimatorHours]);
  const estimatorWorkdaysPerWeek = Math.max(1, currentMonthWage?.workdaysPerWeek ?? 5);
  const recurringRows = useMemo<RecurringDisplayRow[]>(
    () =>
      recurringInsights.map((rule) => {
        const category = rule.categoryId ? categoryById.get(rule.categoryId) : undefined;
        const parentCategory = category?.parentId ? categoryById.get(category.parentId) : undefined;
        const categoryIcon = category
          ? resolveCategoryIcon(category.icon, parentCategory?.icon ?? null)
          : '🔄';
        return {
          id: rule.id,
          name: rule.name,
          isActive: rule.isActive,
          cadenceLabel: formatCadence(rule.recurrencePattern, rule.recurrenceInterval),
          categoryIcon,
          valueLabel: isTimeMode
            ? formatHours(rule.monthlyHours)
            : formatAmount(rule.monthlyAmount, settings, { showSign: false }),
        };
      }),
    [categoryById, isTimeMode, recurringInsights, settings],
  );
  const pagerPageStyle = useMemo(() => [styles.pagerPage, { width: screenWidth }], [screenWidth]);
  const initialPagerOffset = useMemo(
    () => ({ x: defaultTabIndex * screenWidth, y: 0 }),
    [defaultTabIndex, screenWidth],
  );

  const greeting = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    if (timeOfDay === 'morning') return I18n.t('home.greeting.morning');
    if (timeOfDay === 'afternoon') return I18n.t('home.greeting.afternoon');
    return I18n.t('home.greeting.evening');
  }, [settings.locale]);

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
      style={styles.tabScroll}
      contentContainerStyle={styles.tabScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <View style={styles.greetingSection}>
        <Text variant="heading">{greeting}</Text>
        <Text variant="friendly" tone="muted" className="mt-1">
          {isTimeMode ? I18n.t('home.day_mode.time') : I18n.t('home.day_mode.money')}
        </Text>
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
      style={styles.tabScroll}
      contentContainerStyle={styles.recurringContentContainer}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View style={styles.recurringHeader}>
        <View style={styles.recurringHeaderTitleWrap}>
          <Text variant="heading">{I18n.t('home.recurring.title')}</Text>
        </View>
        {onOpenSettingsScreen && (
          <Button
            size="icon"
            variant="secondary"
            style={styles.recurringSettingsButton}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('home.recurring.tab')}
            onPress={() => {
              void triggerHaptic('selection');
              onOpenSettingsScreen('Recurring');
            }}
          >
            <Settings size={18} color={themeColors.textMuted} />
          </Button>
        )}
      </View>

      {recurringRows.length > 0 ? (
        <Card variant="default" style={styles.recurringCard}>
          {recurringRows.map((item, index) => {
            const isLast = index === recurringRows.length - 1;
            return (
              <Animated.View key={item.id} entering={FadeIn.delay(index * 60).duration(350)}>
                <RecurringRuleRow item={item} isLast={isLast} themeColors={themeColors} />
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
    <SafeAreaView className="bg-background" edges={['top']} style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="heading">{I18n.t('app.name')}</Text>
        <DisplayModeToggle />
      </View>
      <HomeTabs
        tabs={homeTabs}
        activeIndex={activeHomeTabIndex}
        pagerOffsetX={pagerOffsetX}
        pagerWidth={screenWidth}
        onTabChange={switchTab}
      />

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        directionalLockEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={handlePagerScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handlePagerScrollEnd}
        decelerationRate="fast"
        style={styles.pagerScroll}
        contentOffset={initialPagerOffset}
      >
        {!isSimpleMode && (
          <View style={pagerPageStyle}>
            <AccountsScreen
              safeAreaEdges={[]}
              onOpenAccount={onOpenAccount}
              onOpenTransaction={onOpenTransaction}
              onOpenSettings={
                onOpenSettingsScreen ? () => onOpenSettingsScreen('Accounts') : undefined
              }
            />
          </View>
        )}
        <View style={pagerPageStyle}>{overviewContent}</View>
        <View style={pagerPageStyle}>{recurringContent}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabsContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsRow: {
    flexDirection: 'row',
  },
  tabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 1,
  },
  pagerScroll: {
    flex: 1,
  },
  pagerPage: {
    flex: 1,
  },
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    paddingBottom: LIST_BOTTOM_PADDING,
  },
  greetingSection: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  recurringContentContainer: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: LIST_BOTTOM_PADDING,
  },
  recurringHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recurringHeaderTitleWrap: {
    flex: 1,
  },
  recurringSettingsButton: {
    height: 40,
    width: 40,
    borderRadius: 20,
  },
  recurringCard: {
    padding: 0,
    overflow: 'hidden',
  },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recurringRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recurringRowInactive: {
    opacity: 0.45,
  },
  recurringIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  recurringIconText: {
    fontSize: 18,
  },
  recurringTextWrap: {
    flex: 1,
    marginRight: spacing.xs,
  },
  recurringCadenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  recurringStaticDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
});
