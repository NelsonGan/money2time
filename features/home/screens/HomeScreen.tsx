import { Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Mascot } from '~/components/feedback/Mascot';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Button, Card, Text, TimeValueInline } from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { getThemeWordmarkPalette, LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme, useThemeColor } from '~/context/ThemeContext';
import { HeroAmountConverter } from '~/features/home/components';
import { AccountsScreen } from '~/features/settings/screens';
import { DisplayModeToggle } from '~/features/transactions/components';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { FONT } from '~/utils/fonts';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatHours,
  normalizeMoneyAmount,
  toRange,
} from '~/utils/formatters';
import { filterRecurringRulesByWallet, recurringAmountPerMonth } from '~/utils/recurringRules';

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
  recurrencePattern: RecurringSectionId;
  cadenceLabel: string;
  categoryIcon: string;
  valueLabel: React.ReactNode;
}

type RecurringSectionId = (typeof RECURRING_SECTION_ORDER)[number];

interface RecurringDisplaySection {
  id: RecurringSectionId;
  label: string;
  rows: RecurringDisplayRow[];
}

const RECURRING_SECTION_ORDER = ['monthly', 'yearly', 'weekly', 'daily'] as const;

function formatRecurringSectionLabel(pattern: RecurringSectionId): string {
  const labels: Record<RecurringSectionId, string> = {
    monthly: I18n.t('transactions.editor.monthly'),
    yearly: I18n.t('transactions.editor.yearly'),
    weekly: I18n.t('transactions.editor.weekly'),
    daily: I18n.t('transactions.editor.daily'),
  };
  return labels[pattern];
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
    () => ({ backgroundColor: `${themeColors.primary}14` }),
    [themeColors.primary],
  );
  const dividerStyle = useMemo(
    () => ({ borderBottomColor: `${themeColors.border}60` }),
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
          <Text variant="caption" tone="muted">
            {item.cadenceLabel}
          </Text>
        </View>
      </View>
      {typeof item.valueLabel === 'string' ? (
        <Text
          variant="mono"
          className={item.isActive ? 'text-destructive' : 'text-muted-foreground'}
          numberOfLines={1}
        >
          {item.valueLabel}
        </Text>
      ) : (
        item.valueLabel
      )}
    </View>
  );
}

// Capsule-style tab bar
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
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth > 0 ? barWidth / tabs.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          tabWidth > 0 && pagerWidth > 0
            ? Math.max(
                0,
                Math.min(
                  (pagerOffsetX.value / pagerWidth) * tabWidth,
                  tabWidth * (tabs.length - 1),
                ),
              )
            : activeIndex * tabWidth,
      },
    ],
    width: tabWidth,
  }));

  return (
    <View
      className="rounded-pill bg-secondary/40 px-1.5 py-1.5"
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width - 12)}
    >
      <View className="relative flex-row" style={{ minHeight: 36 }}>
        {/* Sliding capsule indicator */}
        <Animated.View
          className="absolute top-0 bottom-0 rounded-[16px] bg-card shadow-soft border border-border/30"
          style={indicatorStyle}
        />
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
            className="z-10 h-9 flex-1 items-center justify-center px-2"
          >
            <Text
              variant="caption"
              className={cn(activeIndex === index ? 'text-foreground' : 'text-muted-foreground')}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface HomeScreenProps {
  scrollToTopToken?: number;
  onOpenAccount?: (accountId: string) => void;
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
  onOpenSettingsScreen?: (screen: 'Accounts' | 'Recurring') => void;
  onOpenExpenseTrend?: () => void;
  onOpenExpenseSentiment?: () => void;
  onTutorialTargetLayout?: (
    targetId: 'home.display_toggle' | 'home.converter',
    rect: TutorialTargetRect,
  ) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

export function HomeScreen({
  scrollToTopToken = 0,
  onOpenAccount,
  onOpenTransaction,
  onOpenSettingsScreen,
  onOpenExpenseTrend,
  onOpenExpenseSentiment,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: HomeScreenProps = {}) {
  const themeColors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const themeColor = useThemeColor();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const pagerRef = useRef<React.ElementRef<typeof Animated.ScrollView> | null>(null);
  const displayToggleRef = useRef<View | null>(null);
  const converterRef = useRef<View | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const {
    recurringRules,
    categories,
    settings,
    currentMonthWage,
    isSimpleMode,
    simpleWalletId,
    queryTransactions,
  } = useApp();

  // Power mode: Accounts(0), Home(1), Recurring(2) — default center (1)
  // Simple mode: Home(0), Recurring(1) — default (0)
  const defaultTabIndex = isSimpleMode ? 0 : 1;
  const [activeHomeTabIndex, setActiveHomeTabIndex] = useState(defaultTabIndex);
  const pagerOffsetX = useSharedValue(defaultTabIndex * screenWidth);
  const [estimatorAmount, setEstimatorAmount] = useState('');
  const wordmarkPalette = useMemo(
    () => getThemeWordmarkPalette(themeColor, resolvedTheme),
    [resolvedTheme, themeColor],
  );

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

  const handlePagerScroll = useAnimatedScrollHandler((event) => {
    pagerOffsetX.value = event.contentOffset.x;
  });

  const walletRecurringRules = useMemo(() => {
    if (!isSimpleMode) return recurringRules;
    return filterRecurringRulesByWallet(recurringRules, simpleWalletId);
  }, [recurringRules, isSimpleMode, simpleWalletId]);

  const rate = currentMonthWage?.trueHourlyRate ?? 0;
  const hasHourlyRate = rate > 0;
  const isTimeMode = settings.displayMode === 'time';

  const recurringInsights = useMemo(() => {
    const next: ((typeof walletRecurringRules)[number] & {
      monthlyAmount: number;
      monthlyHours: number;
    })[] = [];
    walletRecurringRules.forEach((rule) => {
      if (rule.type !== 'expense') return;
      const monthlyAmount = recurringAmountPerMonth(
        rule.amount,
        rule.recurrencePattern,
        rule.recurrenceInterval,
      );
      next.push({
        ...rule,
        monthlyAmount,
        monthlyHours: amountToHoursByRate(monthlyAmount, rate),
      });
    });
    next.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return Math.abs(b.monthlyAmount) - Math.abs(a.monthlyAmount);
    });
    return next;
  }, [rate, walletRecurringRules]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const estimatorNumeric = useMemo(() => Number(estimatorAmount) || 0, [estimatorAmount]);
  const estimatorHours = useMemo(
    () => amountToHoursByRate(estimatorNumeric, rate),
    [estimatorNumeric, rate],
  );
  const estimatorWorkdays = useMemo(() => estimatorHours / 8, [estimatorHours]);
  const estimatorWorkdaysPerWeek = Math.max(1, currentMonthWage?.workdaysPerWeek ?? 5);

  // Past 7 days data for mini cards
  const past7DaysData = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const txns = queryTransactions({
      dateRange: toRange(sevenDaysAgo, now),
      accountId: isSimpleMode && simpleWalletId ? simpleWalletId : null,
    });

    let happy = 0;
    let neutral = 0;
    let sad = 0;
    const dailyExpense = new Map<string, number>();

    for (let d = 0; d < 7; d++) {
      const date = new Date(sevenDaysAgo);
      date.setDate(date.getDate() + d);
      dailyExpense.set(dayKeyFromDateLocal(date), 0);
    }

    for (const tx of txns) {
      if (tx.type === 'expense') {
        if (tx.sentiment === 'happy') happy++;
        else if (tx.sentiment === 'sad') sad++;
        else neutral++;
      }
      if (tx.type === 'expense') {
        const key = dayKeyFromIsoLocal(tx.date);
        dailyExpense.set(key, (dailyExpense.get(key) ?? 0) + tx.amount);
      }
    }

    const expenseBars = Array.from(dailyExpense.entries()).map(([key, value]) => ({
      key,
      value,
    }));

    return { happy, neutral, sad, expenseBars };
  }, [isSimpleMode, queryTransactions, simpleWalletId]);

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
          recurrencePattern: rule.recurrencePattern,
          cadenceLabel: formatCadence(rule.recurrencePattern, rule.recurrenceInterval),
          categoryIcon,
          valueLabel: isTimeMode ? (
            <TimeValueInline
              value={formatHours(rule.monthlyHours)}
              variant="mono"
              textClassName={rule.isActive ? 'text-destructive' : 'text-muted-foreground'}
              iconColor={rule.isActive ? themeColors.error : themeColors.textMuted}
              iconSize={11}
            />
          ) : (
            formatAmount(rule.monthlyAmount, settings, { showSign: false })
          ),
        };
      }),
    [
      categoryById,
      isTimeMode,
      recurringInsights,
      settings,
      themeColors.error,
      themeColors.textMuted,
    ],
  );
  const recurringSections = useMemo<RecurringDisplaySection[]>(() => {
    const sections: RecurringDisplaySection[] = [];
    RECURRING_SECTION_ORDER.forEach((pattern) => {
      const rows = recurringRows.filter((item) => item.recurrencePattern === pattern);
      if (rows.length === 0) return;
      sections.push({
        id: pattern,
        label: formatRecurringSectionLabel(pattern),
        rows,
      });
    });
    return sections;
  }, [recurringRows]);
  const recurringTotalCommitment = useMemo(
    () =>
      recurringInsights.reduce((sum, rule) => (rule.isActive ? sum + rule.monthlyAmount : sum), 0),
    [recurringInsights],
  );
  const normalizedRecurringTotalCommitment = useMemo(
    () => normalizeMoneyAmount(recurringTotalCommitment),
    [recurringTotalCommitment],
  );
  const recurringTotalCommitmentHours = useMemo(
    () => amountToHoursByRate(recurringTotalCommitment, rate),
    [rate, recurringTotalCommitment],
  );
  const recurringTotalCommitmentLabel = useMemo(
    () =>
      isTimeMode
        ? formatHours(recurringTotalCommitmentHours)
        : formatAmount(recurringTotalCommitment, settings, {
            showSign: false,
            trueHourlyRate: rate,
          }),
    [isTimeMode, rate, recurringTotalCommitment, recurringTotalCommitmentHours, settings],
  );
  const pagerPageStyle = useMemo(() => [styles.pagerPage, { width: screenWidth }], [screenWidth]);
  const initialPagerOffset = useMemo(
    () => ({ x: defaultTabIndex * screenWidth, y: 0 }),
    [defaultTabIndex, screenWidth],
  );

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToTopToken]);

  const handleDisplayToggleLayout = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    displayToggleRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTargetLayout('home.display_toggle', { x, y, width, height });
    });
  }, [onTutorialTargetLayout]);
  const handleConverterLayout = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    converterRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      const topInset = 13;
      const adjustedHeight = Math.max(1, height - topInset);
      onTutorialTargetLayout('home.converter', {
        x,
        y: y + topInset,
        width,
        height: adjustedHeight,
      });
    });
  }, [onTutorialTargetLayout]);

  useEffect(() => {
    if (!tutorialSpotlightRequest?.active) return;
    if (
      tutorialSpotlightRequest.targetId !== 'home.display_toggle' &&
      tutorialSpotlightRequest.targetId !== 'home.converter'
    ) {
      return;
    }

    if (
      tutorialSpotlightRequest.targetId === 'home.converter' &&
      activeHomeTabIndex !== defaultTabIndex
    ) {
      setActiveHomeTabIndex(defaultTabIndex);
      pagerRef.current?.scrollTo({ x: defaultTabIndex * screenWidth, animated: false });
    }

    const measureCurrentTarget =
      tutorialSpotlightRequest.targetId === 'home.converter'
        ? handleConverterLayout
        : handleDisplayToggleLayout;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      measureCurrentTarget();
    });
    const firstPass = setTimeout(() => {
      measureCurrentTarget();
    }, 40);
    const secondPass = setTimeout(() => {
      measureCurrentTarget();
    }, 220);
    const thirdPass = setTimeout(() => {
      measureCurrentTarget();
    }, 460);
    const androidExtraPass =
      Platform.OS === 'android'
        ? setTimeout(() => {
            measureCurrentTarget();
          }, 720)
        : null;

    return () => {
      interactionHandle.cancel();
      clearTimeout(firstPass);
      clearTimeout(secondPass);
      clearTimeout(thirdPass);
      if (androidExtraPass) clearTimeout(androidExtraPass);
    };
  }, [
    activeHomeTabIndex,
    defaultTabIndex,
    handleConverterLayout,
    handleDisplayToggleLayout,
    screenWidth,
    tutorialSpotlightRequest,
  ]);

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
      <TabletContentContainer>
        {/* Mini insight cards */}
        <Animated.View
          entering={FadeIn.delay(100).duration(400)}
          className="flex-row gap-3 mx-5 mt-3"
        >
          {/* Sentiment card */}
          <Pressable
            onPress={() => {
              void triggerHaptic('medium');
              onOpenExpenseSentiment?.();
            }}
            className="flex-1 rounded-2xl border border-border/25 bg-card p-3 justify-between"
          >
            <Text variant="caption" tone="muted">
              {I18n.t('home.weekly_mood')}
            </Text>
            <View className="flex-row items-center justify-between mt-2">
              <View className="flex-row items-center gap-1">
                <SentimentIcon sentiment="sad" size={20} />
                <Text variant="caption" className="text-foreground">
                  {past7DaysData.sad}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <SentimentIcon sentiment="neutral" size={20} />
                <Text variant="caption" className="text-foreground">
                  {past7DaysData.neutral}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <SentimentIcon sentiment="happy" size={20} />
                <Text variant="caption" className="text-foreground">
                  {past7DaysData.happy}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Expense bar chart card */}
          <Pressable
            onPress={() => {
              void triggerHaptic('medium');
              onOpenExpenseTrend?.();
            }}
            className="flex-1 rounded-2xl border border-border/25 bg-card p-3 justify-between"
          >
            <Text variant="caption" tone="muted">
              {I18n.t('home.recent_spendings')}
            </Text>
            <View className="flex-row items-end gap-1.5 mt-2" style={{ height: 24 }}>
              {past7DaysData.expenseBars.map((bar) => {
                const maxVal = Math.max(...past7DaysData.expenseBars.map((b) => b.value), 1);
                const barHeight = bar.value > 0 ? Math.max(4, (bar.value / maxVal) * 22) : 3;
                return (
                  <View
                    key={bar.key}
                    className="flex-1"
                    style={{
                      height: barHeight,
                      borderRadius: 2,
                      backgroundColor:
                        bar.value > 0 ? themeColors.primary : `${themeColors.border}40`,
                      opacity: bar.value > 0 ? 0.6 : 0.3,
                    }}
                  />
                );
              })}
            </View>
          </Pressable>
        </Animated.View>

        <View ref={converterRef} onLayout={handleConverterLayout}>
          <Animated.View entering={FadeIn.delay(150).duration(500)}>
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
        </View>
      </TabletContentContainer>
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
      <TabletContentContainer>
        <View style={styles.recurringSummaryHeader}>
          <View style={styles.recurringSummaryContent}>
            <Text variant="label" tone="muted" style={styles.recurringSummaryLabel}>
              {I18n.t('home.recurring.total_commitment')}
            </Text>
            <View style={styles.recurringSummaryValueRow}>
              {settings.displayMode !== 'time' ? (
                <Text
                  variant="heading"
                  style={[
                    styles.recurringSummaryValue,
                    {
                      color:
                        normalizedRecurringTotalCommitment > 0
                          ? themeColors.error
                          : themeColors.textMuted,
                    },
                  ]}
                >
                  {recurringTotalCommitmentLabel}
                </Text>
              ) : (
                <TimeValueInline
                  value={recurringTotalCommitmentLabel}
                  variant="heading"
                  textClassName={
                    normalizedRecurringTotalCommitment > 0
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }
                  iconColor={
                    normalizedRecurringTotalCommitment > 0
                      ? themeColors.error
                      : themeColors.textMuted
                  }
                />
              )}
              <Text variant="caption" tone="muted" style={styles.recurringSummarySuffix}>
                {I18n.t('home.recurring.per_month')}
              </Text>
            </View>
          </View>
          {onOpenSettingsScreen ? (
            <View style={styles.recurringSummaryActions}>
              <Button
                size="icon"
                variant="secondary"
                haptic="selection"
                className="h-10 w-10 rounded-full"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('home.recurring.tab')}
                onPress={() => {
                  onOpenSettingsScreen('Recurring');
                }}
              >
                <Settings size={18} color={themeColors.textMuted} />
              </Button>
            </View>
          ) : null}
        </View>

        {recurringSections.length > 0 ? (
          recurringSections.map((section, sectionIndex) => (
            <View key={section.id} className="pb-2">
              <View
                className={cn(
                  'pl-1 pr-3 pb-1 flex-row items-center justify-between',
                  sectionIndex === 0 ? 'pt-1.5' : 'pt-5',
                )}
              >
                <Text variant="label" tone="muted">
                  {section.label}
                </Text>
              </View>
              <Card variant="default" style={styles.recurringCard}>
                {section.rows.map((item, index) => {
                  const isLast = index === section.rows.length - 1;
                  const animationDelay = sectionIndex * 60 + index * 40;
                  return (
                    <Animated.View
                      key={item.id}
                      entering={FadeIn.delay(animationDelay).duration(350)}
                    >
                      <RecurringRuleRow item={item} isLast={isLast} themeColors={themeColors} />
                    </Animated.View>
                  );
                })}
              </Card>
            </View>
          ))
        ) : (
          <EmptyState
            title={I18n.t('home.recurring.none_title')}
            message={I18n.t('home.recurring.none_message')}
            mascotMood="sleepy"
          />
        )}
      </TabletContentContainer>
    </ScrollView>
  );

  return (
    <SafeAreaView className="bg-background" edges={['top']} style={styles.container}>
      <View className="bg-background pb-1.5 pt-1">
        <TabletContentContainer>
          <View className="px-5 pt-1.5 gap-2.5">
            {/* Header with app name and display toggle */}
            <View style={styles.headerRow}>
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={I18n.t('app.name')}
                style={styles.headerBrandRow}
              >
                <View style={styles.headerBrandMascot}>
                  <Mascot size={36} name="wink" animate />
                </View>
                <View style={styles.headerBrandWordmark}>
                  <Text style={[styles.headerBrandMoney, { color: wordmarkPalette.money }]}>
                    Money
                  </Text>
                  <Text style={[styles.headerBrandTwo, { color: wordmarkPalette.two }]}>2</Text>
                  <Text style={[styles.headerBrandTime, { color: wordmarkPalette.time }]}>
                    Time
                  </Text>
                </View>
              </View>
              <View
                ref={displayToggleRef}
                onLayout={handleDisplayToggleLayout}
                className="h-10 justify-center"
              >
                <DisplayModeToggle />
              </View>
            </View>

            {/* Capsule tab bar */}
            <HomeTabs
              tabs={homeTabs}
              activeIndex={activeHomeTabIndex}
              pagerOffsetX={pagerOffsetX}
              pagerWidth={screenWidth}
              onTabChange={switchTab}
            />
          </View>
        </TabletContentContainer>
      </View>

      <Animated.ScrollView
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
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    gap: spacing.sm,
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
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  headerBrandMascot: {
    marginRight: 8,
  },
  headerBrandWordmark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headerBrandMoney: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: FONT.black,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  headerBrandTwo: {
    fontSize: 13,
    lineHeight: 14,
    fontFamily: FONT.black,
    fontWeight: '900',
    marginLeft: 1,
    marginRight: 0,
  },
  headerBrandTime: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: FONT.black,
    fontWeight: '900',
    letterSpacing: -0.9,
    marginLeft: -1,
  },
  recurringContentContainer: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: LIST_BOTTOM_PADDING,
  },
  recurringSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xxs,
  },
  recurringSummaryContent: {
    flex: 1,
    paddingRight: spacing.md,
  },
  recurringSummaryLabel: {
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 10,
  },
  recurringSummaryValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  recurringSummaryValue: {
    marginTop: 2,
  },
  recurringSummarySuffix: {
    marginBottom: 3,
  },
  recurringSummaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  recurringCard: {
    padding: 0,
    overflow: 'hidden',
  },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  recurringRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recurringRowInactive: {
    opacity: 0.45,
  },
  recurringIconWrap: {
    width: 42,
    height: 42,
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
