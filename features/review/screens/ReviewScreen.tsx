import { CalendarDays, ChevronDown, ListChecks, Moon, TrendingDown } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { EmptyState } from '~/components/feedback/EmptyState';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { CategoryEmoji, ClayIcon, Text } from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { useValueWhileTabVisible } from '~/context/TabVisibilityContext';
import { useGoals } from '~/features/goals/useGoals';
import { filterSpendingTransactions } from '~/features/reimbursements/lib/reimbursementMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { consumePendingReviewZoom, subscribeReviewZoomRequest } from '~/services/reviewNavigation';
import type { GoalWithProgress, TransactionSentiment, TransactionWithRelations } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { dayKeyFromIsoLocal, formatAmount } from '~/utils/formatters';
import { toSpendingRows } from '~/utils/spending';

import {
  barLabel,
  deltaLabel,
  money,
  paceBadgeLabel,
  pacePercentLabel,
  periodPillLabel,
  periodTitle,
  shortDayLabel,
  weekdayDayLabel,
} from '../lib/reviewFormat';
import {
  buildReviewSummary,
  expenseTotalForPeriod,
  goalContributionsForPeriod,
  PACE_SAMPLE_SIZE,
  type ReviewCategory,
  type ReviewSummary,
  UNCATEGORIZED_ID,
} from '../lib/reviewMath';
import {
  listCompletedPeriods,
  monthKeyOfPeriod,
  type ReviewPeriod,
  type ReviewZoom,
  shiftPeriod,
} from '../lib/reviewPeriods';

interface ReviewPagerViewProps {
  /** Controlled by the host so the zoom dropdown can live in the header. */
  zoom: ReviewZoom;
  onZoomChange: (zoom: ReviewZoom) => void;
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
}

const TREND_HEIGHT = 116;
const RING_SIZE = 68;
const RING_RADIUS = 27;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Clear space inside the ring's stroke, which the centred percentage fits in. */
const RING_INNER_WIDTH = 44;
/** Dash slots making up the trend chart's average line. */
const AVERAGE_LINE_DASHES = Array.from({ length: 28 }, (_, index) => index);

export function ReviewPagerView({ zoom, onZoomChange, onOpenTransaction }: ReviewPagerViewProps) {
  const { settings, categories, monthlyBudgets, getTrueHourlyRateForDate } = useApp();
  const { transactions: liveTransactions } = useTransactions();
  // The Insights tab stays mounted for the app's lifetime, so hold the last
  // value while hidden rather than re-aggregating on every write elsewhere.
  const transactions = useValueWhileTabVisible(liveTransactions);

  // One remembered period per zoom, so switching Week -> Month -> Week comes
  // back to where the user was rather than jumping to the newest.
  const [selectedByZoom, setSelectedByZoom] = useState<Partial<Record<ReviewZoom, string>>>({});
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  // A review reminder tap names the zoom it recapped.
  useEffect(() => {
    const pending = consumePendingReviewZoom();
    if (pending) onZoomChange(pending);
    return subscribeReviewZoomRequest((requested) => {
      onZoomChange(requested);
      // Land on the newest completed period, which is the one the reminder was
      // about, not wherever the user last browsed to.
      setSelectedByZoom((previous) => ({ ...previous, [requested]: undefined }));
    });
    // Subscribing once on mount is the point; re-running on every render of the
    // host would drop and rebuild the listener and lose a buffered request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Day key of the oldest live row, which is where the period rail stops.
  // Normalized rather than compared as a raw ISO timestamp, so it lines up with
  // the `YYYY-MM-DD` bounds the period helpers work in.
  const earliestTransactionDate = useMemo(() => {
    let earliest: string | null = null;
    for (const transaction of transactions) {
      if (transaction.deletedAt) continue;
      const dayKey = dayKeyFromIsoLocal(transaction.date);
      if (earliest === null || dayKey < earliest) earliest = dayKey;
    }
    return earliest;
  }, [transactions]);

  const periods = useMemo(
    () =>
      listCompletedPeriods({
        zoom,
        today: new Date(),
        weekStartsOn: settings.weekStartsOn,
        firstDayOfMonth: settings.firstDayOfMonth,
        earliestTransactionDate,
      }),
    [earliestTransactionDate, settings.firstDayOfMonth, settings.weekStartsOn, zoom],
  );

  const selectedIndex = useMemo(() => {
    const remembered = selectedByZoom[zoom];
    const index = remembered ? periods.findIndex((period) => period.key === remembered) : -1;
    // Default to the newest completed period (the rail's last pill).
    return index >= 0 ? index : periods.length - 1;
  }, [periods, selectedByZoom, zoom]);

  const period = periods[selectedIndex];

  const selectPeriod = useCallback(
    (next: ReviewPeriod) => {
      setSelectedByZoom((previous) => ({ ...previous, [zoom]: next.key }));
      setExpandedCategoryId(null);
    },
    [zoom],
  );

  // The whole page is a spending report, so the reimbursement rows come out
  // once here rather than inside each of the numbers below.
  const spendingTransactions = useMemo(
    // `toSpendingRows` reshapes a counted loan repayment into an expense on the
    // funding account, so every number below counts it without knowing what a
    // transfer is.
    () =>
      toSpendingRows(
        filterSpendingTransactions(transactions, settings.reimbursementsCountAsExpense),
      ),
    [transactions, settings.reimbursementsCountAsExpense],
  );

  // The pace card and the delta need the periods *before* the selected one,
  // which can reach back past the rail's own window.
  const previousExpenses = useMemo(() => {
    if (!period) return [];
    const totals: number[] = [];
    for (let step = 1; step <= PACE_SAMPLE_SIZE[period.zoom]; step += 1) {
      totals.push(
        expenseTotalForPeriod(
          spendingTransactions,
          shiftPeriod(period, step, settings.firstDayOfMonth),
        ),
      );
    }
    return totals;
  }, [period, settings.firstDayOfMonth, spendingTransactions]);

  const summary = useMemo(() => {
    if (!period) return null;
    const monthKey = monthKeyOfPeriod(period);
    const budget = monthKey
      ? monthlyBudgets.find((entry) => entry.month === monthKey && !entry.deletedAt)
      : null;
    return buildReviewSummary({
      period,
      transactions: spendingTransactions,
      categories,
      // Value the period's spend at the rate that applied when it ended, so a
      // later raise does not rewrite what an old week cost in hours.
      hourlyRate: getTrueHourlyRateForDate(period.end),
      budgetTotal: budget?.totalAmount ?? null,
      previousExpenses,
    });
  }, [
    categories,
    getTrueHourlyRateForDate,
    monthlyBudgets,
    period,
    previousExpenses,
    spendingTransactions,
  ]);

  // Goals read live balances, so hold them with the tab like the transaction
  // list: the Insights tab stays mounted and would otherwise recompute on every
  // write made elsewhere in the app.
  const activeGoals = useValueWhileTabVisible(useGoals().active);
  const goalContributions = useMemo(() => {
    if (!period || activeGoals.length === 0) return new Map<string, number>();
    return goalContributionsForPeriod(
      transactions,
      period,
      new Set(activeGoals.map((goal) => goal.account.id)),
    );
  }, [activeGoals, period, transactions]);

  const openTransactionById = useCallback(
    (transactionId: string) => {
      const transaction = transactions.find((entry) => entry.id === transactionId);
      if (transaction) onOpenTransaction?.(transaction);
    },
    [onOpenTransaction, transactions],
  );

  if (!period || !summary) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <EmptyState mascotName="confused" title={I18n.t('review.empty_title')} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <TabletContentContainer>
        <PeriodRail
          periods={periods}
          selectedIndex={selectedIndex}
          locale={settings.locale}
          onSelect={selectPeriod}
        />

        {summary.isEmpty ? (
          <View className="mt-10 items-center px-6">
            <EmptyState
              mascotName="sleeping"
              title={I18n.t('review.nothing_logged_title')}
              message={I18n.t('review.nothing_logged_description')}
            />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(220)} style={styles.cardStack}>
            <SpentCard summary={summary} />
            <FlowCard summary={summary} />
            <TrendCard summary={summary} />
            {summary.pace ? <PaceCard summary={summary} /> : null}
            <CategoriesCard
              summary={summary}
              expandedCategoryId={expandedCategoryId}
              onToggleCategory={setExpandedCategoryId}
              onOpenTransaction={onOpenTransaction ? openTransactionById : undefined}
            />
            {activeGoals.length > 0 ? (
              <GoalsCard goals={activeGoals} contributions={goalContributions} />
            ) : null}
            <MoodCard summary={summary} />
            <StandoutsCard summary={summary} />
          </Animated.View>
        )}
      </TabletContentContainer>
    </ScrollView>
  );
}

function PeriodRail({
  periods,
  selectedIndex,
  locale,
  onSelect,
}: {
  periods: ReviewPeriod[];
  selectedIndex: number;
  locale: string;
  onSelect: (period: ReviewPeriod) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<number[]>([]);
  const widthRef = useRef(0);

  // Switching zoom swaps the whole rail (52 weekly pills for 3 yearly ones), so
  // the measured offsets have to go with it. Kept during render rather than in
  // an effect: an effect would run *after* the first paint with the new pills,
  // long enough to scroll to a stale offset and visibly jump.
  const measuredForRef = useRef(periods);
  if (measuredForRef.current !== periods) {
    measuredForRef.current = periods;
    offsetsRef.current = [];
  }

  const centerSelected = useCallback(() => {
    const offset = offsetsRef.current[selectedIndex];
    if (offset === undefined || widthRef.current === 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, offset - widthRef.current / 2), animated: true });
  }, [selectedIndex]);

  useEffect(centerSelected, [centerSelected]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal ScrollView inside a vertical one will stretch to the
      // parent's full content height unless it is pinned, which left the pills
      // sitting at the top with every card painted over them.
      style={styles.rail}
      contentContainerStyle={styles.railContent}
      onLayout={(event) => {
        widthRef.current = event.nativeEvent.layout.width;
        centerSelected();
      }}
    >
      {periods.map((period, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Pressable
            key={period.key}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              offsetsRef.current[index] = x + width / 2;
              if (isSelected) centerSelected();
            }}
            onPress={() => {
              void triggerHaptic('selection');
              onSelect(period);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`h-9 items-center justify-center rounded-full border px-4 ${
              isSelected ? 'border-primary bg-primary' : 'border-border/50 bg-card'
            }`}
          >
            <Text
              variant="caption"
              className={isSelected ? 'text-primary-foreground' : 'text-foreground/60'}
            >
              {periodPillLabel(period, locale)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Card shell — one shape for every section on the page

/**
 * One shell for every section: a real title in the foreground, optional meta on
 * the right, then content. The titles used to be muted uppercase micro-labels,
 * which at caption weight read as washed-out placeholder text rather than
 * headings, and gave seven cards no hierarchy between them.
 */
function Card({
  title,
  meta,
  metaNode,
  children,
}: {
  title: string;
  meta?: string;
  metaNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-3xl border border-border/25 bg-card p-4 shadow-soft">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="bodyStrong" className="shrink-0 text-foreground">
          {title}
        </Text>
        {/* The meta takes the slack and truncates, so a long period label
            ("27 Jul to 2 Aug") can never squeeze the card's title. */}
        {metaNode ??
          (meta ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1 text-right">
              {meta}
            </Text>
          ) : null)}
      </View>
      <View className="mt-3">{children}</View>
    </View>
  );
}

function SpentCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const { delta } = summary;
  const percent = delta ? Math.round(delta.changeRatio * 100) : 0;
  const deltaTint = !delta
    ? themeColors.textMuted
    : percent === 0
      ? themeColors.textMuted
      : percent < 0
        ? themeColors.success
        : themeColors.error;

  return (
    // The period lives here rather than on its own line above the cards: it is
    // context for the number, not a heading in its own right.
    <Card title={I18n.t('review.spent')} meta={periodTitle(summary.period, settings.locale)}>
      <View className="flex-row flex-wrap items-center gap-2.5">
        <Text variant="display">{money(summary.expense, settings)}</Text>
        {delta ? (
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${deltaTint}22` }}>
            <Text variant="caption" style={{ color: deltaTint }}>
              {deltaLabel(delta.changeRatio)}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function FlowCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const ratio = summary.savedRatio;
  // A negative saved ratio (spent more than came in) would wrap the ring past
  // its own start, so the arc clamps while the caption keeps the real number.
  const arc = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));

  return (
    <Card title={I18n.t('review.in_and_out')}>
      <View className="flex-row items-center gap-4">
        <View style={styles.ring}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={`${themeColors.border}99`}
              strokeWidth={7}
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={summary.net >= 0 ? themeColors.success : themeColors.error}
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - arc)}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          {/* Just the percentage — the "Saved" row alongside already names it,
              and a second caption inside a 68px ring only crowds the number.
              Sized to the ring's hole rather than left at body size: a three
              digit percentage ("100%", or "-150%" when the period spent more
              than it took in) ran into the stroke on both sides. */}
          <View style={styles.ringCenter}>
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.ringValue}
            >
              {ratio === null ? I18n.t('review.not_applicable') : `${Math.round(ratio * 100)}%`}
            </Text>
          </View>
        </View>

        <View className="flex-1 gap-2.5">
          <FlowRow
            color={themeColors.success}
            label={I18n.t('review.came_in')}
            value={money(summary.income, settings)}
            valueColor={themeColors.success}
          />
          <FlowRow
            color={themeColors.error}
            label={I18n.t('review.went_out')}
            value={money(summary.expense, settings)}
            valueColor={themeColors.error}
          />
          <View className="h-px bg-border/40" />
          <View className="flex-row items-center gap-2">
            <Text variant="bodyStrong" className="flex-1">
              {I18n.t('review.saved')}
            </Text>
            <Text
              variant="bodyStrong"
              style={{ color: summary.net >= 0 ? themeColors.success : themeColors.error }}
            >
              {money(summary.net, settings)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

function FlowRow({
  color,
  label,
  value,
  valueColor,
}: {
  color: string;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <Text variant="caption" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="bodyStrong" style={{ color: valueColor }}>
        {value}
      </Text>
    </View>
  );
}

function TrendCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const peak = summary.bars.reduce((max, bar) => Math.max(max, bar.value), 0);
  // Leave 10% headroom so the tallest bar does not touch the card's edge.
  const ceiling = peak * 1.1;

  return (
    <Card title={I18n.t('review.trend')}>
      <View style={styles.trend}>
        {ceiling > 0 ? (
          <View
            style={[
              styles.trendAverageLine,
              { bottom: (summary.barAverage / ceiling) * TREND_HEIGHT },
            ]}
            pointerEvents="none"
          >
            {/* Drawn as discrete dashes rather than a dashed border: React
                Native ignores `borderStyle: 'dashed'` on a single-side border on
                iOS, which rendered the average line as nothing at all. */}
            {AVERAGE_LINE_DASHES.map((dash) => (
              <View
                key={dash}
                style={[styles.trendAverageDash, { backgroundColor: `${themeColors.textMuted}80` }]}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.trendBars}>
          {summary.bars.map((bar) => (
            <View key={bar.key} style={styles.trendBarColumn}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height:
                      ceiling > 0 && bar.value > 0
                        ? Math.max(4, (bar.value / ceiling) * TREND_HEIGHT)
                        : 0,
                    backgroundColor: bar.isPeak ? themeColors.primary : `${themeColors.primary}47`,
                  },
                ]}
              />
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: bar.isPeak ? themeColors.primary : themeColors.textMuted }}
              >
                {barLabel(bar, summary.period.zoom, settings.locale)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

function PaceCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const pace = summary.pace;
  if (!pace) return null;

  const tint =
    pace.state === 'over'
      ? themeColors.error
      : pace.state === 'close'
        ? themeColors.accent
        : themeColors.success;

  return (
    <Card
      title={I18n.t('review.pace')}
      metaNode={
        <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: `${tint}22` }}>
          <Text variant="caption" style={{ color: tint }}>
            {paceBadgeLabel(pace, settings)}
          </Text>
        </View>
      }
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="body" tone="muted" className="flex-1">
          {pace.kind === 'budget'
            ? I18n.t('review.pace_of_budget', {
                spent: money(pace.spent, settings),
                target: money(pace.target, settings),
              })
            : I18n.t('review.pace_usual', { amount: money(pace.target, settings) })}
        </Text>
        <Text variant="heading" style={{ color: tint }}>
          {pacePercentLabel(pace.ratio)}
        </Text>
      </View>

      <View className="mt-2.5 h-2 overflow-hidden rounded-full bg-border/55">
        <View
          className="h-2 rounded-full"
          style={{ width: `${Math.min(pace.ratio, 1) * 100}%`, backgroundColor: tint }}
        />
      </View>
    </Card>
  );
}

function CategoriesCard({
  summary,
  expandedCategoryId,
  onToggleCategory,
  onOpenTransaction,
}: {
  summary: ReviewSummary;
  expandedCategoryId: string | null;
  onToggleCategory: (id: string | null) => void;
  onOpenTransaction?: (transactionId: string) => void;
}) {
  if (summary.categories.length === 0) return null;

  return (
    <Card title={I18n.t('review.categories')}>
      <View className="gap-3">
        {summary.categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            expanded={expandedCategoryId === category.id}
            onToggle={() => {
              void triggerHaptic('selection');
              onToggleCategory(expandedCategoryId === category.id ? null : category.id);
            }}
            onOpenTransaction={onOpenTransaction}
          />
        ))}
      </View>
    </Card>
  );
}

function CategoryRow({
  category,
  expanded,
  onToggle,
  onOpenTransaction,
}: {
  category: ReviewCategory;
  expanded: boolean;
  onToggle: () => void;
  onOpenTransaction?: (transactionId: string) => void;
}) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const label = category.label || I18n.t('review.uncategorized');

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center gap-3"
      >
        <View className="h-9 w-9 items-center justify-center rounded-2xl bg-surface-muted/70">
          {category.id === UNCATEGORIZED_ID ? (
            <ClayIcon name="money-time/invoice" size={22} />
          ) : (
            <CategoryEmoji icon={category.icon} size={22} />
          )}
        </View>
        {/* The chevron sits outside this column, not inside the name row: while
            it was in there the amount stopped short of the card edge by the
            chevron's width and no longer lined up with the share below it. */}
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-2">
            <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
              {label}
            </Text>
            <Text variant="bodyStrong">{money(category.amount, settings)}</Text>
          </View>
          <View className="mt-1.5 flex-row items-center gap-2">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
              <View
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.max(category.barRatio * 100, 2)}%`,
                  backgroundColor: themeColors.primary,
                }}
              />
            </View>
            <Text variant="caption" tone="muted" className="w-9 text-right">
              {`${Math.round(category.share * 100)}%`}
            </Text>
          </View>
        </View>
        <ChevronDown
          size={14}
          color={themeColors.textMuted}
          style={expanded ? styles.chevronOpen : undefined}
        />
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.categoryItems}>
          {category.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={onOpenTransaction ? () => onOpenTransaction(item.id) : undefined}
              className="flex-row items-center gap-2"
            >
              <View className="flex-1">
                <Text variant="caption" numberOfLines={1} className="text-foreground">
                  {item.label || label}
                </Text>
                <Text variant="caption" tone="muted">
                  {item.accountName
                    ? `${item.accountName} · ${shortDayLabel(item.dayKey, settings.locale)}`
                    : shortDayLabel(item.dayKey, settings.locale)}
                </Text>
              </View>
              <Text variant="caption" className="text-foreground">
                {money(item.amount, settings)}
              </Text>
            </Pressable>
          ))}
          {category.restCount > 0 ? (
            <View className="flex-row items-center gap-2 pt-0.5">
              <Text variant="caption" tone="muted" className="flex-1">
                {I18n.t('review.other_entries', { count: category.restCount })}
              </Text>
              <Text variant="caption" tone="muted">
                {money(category.restAmount, settings)}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const SENTIMENT_LABEL_KEY: Record<TransactionSentiment, string> = {
  happy: 'review.mood_happy',
  neutral: 'review.mood_neutral',
  sad: 'review.mood_regret',
};

function MoodCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const tint: Record<TransactionSentiment, string> = {
    happy: themeColors.success,
    neutral: `${themeColors.textMuted}8C`,
    sad: themeColors.error,
  };
  if (!summary.sentiment.some((slice) => slice.amount > 0)) return null;

  return (
    <Card title={I18n.t('review.mood')}>
      <View className="h-2.5 flex-row gap-0.5 overflow-hidden rounded-full">
        {summary.sentiment.map((slice) => (
          <View
            key={slice.sentiment}
            style={{ flex: Math.max(slice.share, 0), backgroundColor: tint[slice.sentiment] }}
          />
        ))}
      </View>

      <View className="mt-3.5 gap-2.5">
        {summary.sentiment.map((slice) => (
          <View key={slice.sentiment} className="flex-row items-center gap-2.5">
            <SentimentIcon sentiment={slice.sentiment} size={22} />
            <Text variant="caption" tone="muted" className="flex-1">
              {I18n.t(SENTIMENT_LABEL_KEY[slice.sentiment])}
            </Text>
            <Text variant="caption" tone="muted">
              {`${Math.round(slice.share * 100)}%`}
            </Text>
            <Text variant="bodyStrong">{money(slice.amount, settings)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * Four figures that only make sense at a glance, so they read as a 2x2 board of
 * tiles rather than a list of sentences. Each tile is one tinted icon, one
 * micro-label and one value, which is what pulled the card out of the wall of
 * plain left-aligned text it used to be.
 */
function StandoutsCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const { standouts } = summary;

  const tiles = [
    standouts.biggestExpense && {
      key: 'biggest',
      Icon: TrendingDown,
      tint: themeColors.error,
      label: I18n.t('review.biggest_expense'),
      value: money(standouts.biggestExpense.amount, settings),
      sub: standouts.biggestExpense.label || undefined,
    },
    standouts.busiestDay && {
      key: 'busiest',
      Icon: CalendarDays,
      tint: themeColors.primary,
      label: I18n.t('review.busiest_day'),
      value: weekdayDayLabel(standouts.busiestDay.dayKey, settings.locale),
      sub: I18n.t('review.entries_count', { count: standouts.busiestDay.count }),
    },
    {
      key: 'quiet',
      Icon: Moon,
      tint: themeColors.textMuted,
      label: I18n.t('review.quiet_days'),
      value: I18n.t('review.of_total', {
        count: standouts.quietDayCount,
        total: standouts.totalDayCount,
      }),
      sub: undefined,
    },
    {
      key: 'entries',
      Icon: ListChecks,
      tint: themeColors.success,
      label: I18n.t('review.entries_logged'),
      value: String(standouts.entryCount),
      sub: undefined,
    },
  ].filter(Boolean) as {
    key: string;
    Icon: typeof TrendingDown;
    tint: string;
    label: string;
    value: string;
    sub?: string;
  }[];

  return (
    <Card title={I18n.t('review.standouts')}>
      {/* Explicit rows of two rather than `flex-wrap`: a wrapped row stretches
          its lines to share the container's cross size, which blew each tile up
          to a quarter of the screen. Two plain rows size to their content and
          `items-stretch` still matches the pair's heights. */}
      <View className="gap-2">
        {[tiles.slice(0, 2), tiles.slice(2, 4)]
          .filter((row) => row.length > 0)
          .map((row, rowIndex) => (
            <View key={rowIndex} className="flex-row items-stretch gap-2">
              {row.map(({ key, Icon, tint, label, value, sub }) => (
                <View key={key} className="flex-1 rounded-2xl bg-secondary/40 p-3">
                  <View
                    className="h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: withColorAlpha(tint, 0.14) }}
                  >
                    <Icon size={14} color={tint} strokeWidth={2.4} />
                  </View>
                  <Text variant="label" tone="muted" numberOfLines={1} className="mt-2">
                    {label}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={1} className="mt-1 text-foreground">
                    {value}
                  </Text>
                  {sub ? (
                    <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
                      {sub}
                    </Text>
                  ) : null}
                </View>
              ))}
              {row.length === 1 ? <View className="flex-1" /> : null}
            </View>
          ))}
      </View>
    </Card>
  );
}

/**
 * Where each ongoing goal stands, plus what this period actually put into it.
 * Archived and achieved-and-archived goals are already filtered out upstream, so
 * an empty list means there is nothing in flight and the card is skipped.
 */
function GoalsCard({
  goals,
  contributions,
}: {
  goals: GoalWithProgress[];
  contributions: Map<string, number>;
}) {
  const { settings } = useApp();
  const themeColors = useThemeColors();

  return (
    <Card title={I18n.t('review.goals')}>
      <View className="gap-3.5">
        {goals.map(({ account, progress }) => {
          const added = contributions.get(account.id) ?? 0;
          const ratio = Math.max(0, Math.min(progress.ratio, 1));
          const tint = progress.ratio >= 1 ? themeColors.success : themeColors.primary;
          return (
            <View key={account.id}>
              <View className="flex-row items-center gap-2.5">
                <CategoryEmoji icon={account.goalEmoji} size={20} hidePlaceholder />
                <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
                  {account.name}
                </Text>
                {added !== 0 ? (
                  <View
                    className="rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: withColorAlpha(
                        added > 0 ? themeColors.success : themeColors.error,
                        0.14,
                      ),
                    }}
                  >
                    <Text
                      variant="caption"
                      style={{ color: added > 0 ? themeColors.success : themeColors.error }}
                    >
                      {formatAmount(
                        added,
                        { ...settings, displayMode: 'money' },
                        { showSign: true },
                      )}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border/50">
                <View
                  className="h-1.5 rounded-full"
                  style={{ width: `${Math.max(ratio * 100, 2)}%`, backgroundColor: tint }}
                />
              </View>
              <View className="mt-1 flex-row items-center justify-between gap-2">
                <Text variant="caption" tone="muted" numberOfLines={1} className="min-w-0 flex-1">
                  {I18n.t('review.goal_of_target', {
                    saved: money(progress.saved, settings),
                    target: money(progress.target, settings),
                  })}
                </Text>
                <Text variant="caption" style={{ color: tint }}>
                  {`${Math.round(progress.ratio * 100)}%`}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 140,
  },
  rail: {
    flexGrow: 0,
    flexShrink: 0,
  },
  railContent: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 2,
  },
  cardStack: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
  },
  cardBody: {
    marginTop: spacing.sm,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    // The hole inside the ring's 7px stroke, so the shrink-to-fit has a bound.
    width: RING_INNER_WIDTH,
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
  },
  trend: {
    height: TREND_HEIGHT + 20,
    justifyContent: 'flex-end',
  },
  trendAverageLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Sits above the tick labels, which occupy the bottom 20px.
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendAverageDash: {
    width: 4,
    height: 1,
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  trendBarColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  trendBar: {
    width: '100%',
    maxWidth: 26,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  shareLabel: {
    width: 34,
    textAlign: 'right',
  },
  categoryItems: {
    marginTop: spacing.xs,
    marginLeft: 44,
    paddingLeft: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(148,163,159,0.3)',
    gap: spacing.xs,
  },
});
