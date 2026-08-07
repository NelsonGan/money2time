import { ChevronDown } from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { EmptyState } from '~/components/feedback/EmptyState';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { CategoryEmoji, ClayIcon, SegmentedToggle, Text } from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { useValueWhileTabVisible } from '~/context/TabVisibilityContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { consumePendingReviewZoom, subscribeReviewZoomRequest } from '~/services/reviewNavigation';
import type { TransactionSentiment, TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal, formatHours } from '~/utils/formatters';

import {
  barLabel,
  deltaLabel,
  deltaNote,
  money,
  paceBadgeLabel,
  pacePercentLabel,
  periodPillLabel,
  periodSubtitle,
  periodTitle,
  shortDayLabel,
  trendTitle,
  weekdayDayLabel,
} from '../lib/reviewFormat';
import {
  buildReviewSummary,
  expenseTotalForPeriod,
  PACE_SAMPLE_SIZE,
  type ReviewCategory,
  type ReviewSummary,
  UNCATEGORIZED_ID,
} from '../lib/reviewMath';
import {
  listCompletedPeriods,
  monthKeyOfPeriod,
  REVIEW_ZOOMS,
  type ReviewPeriod,
  type ReviewZoom,
  shiftPeriod,
} from '../lib/reviewPeriods';

export interface ReviewPagerViewHandle {
  /** Steps the selected period: -1 goes back in time, 1 goes forward. */
  scrollToRelative: (direction: 1 | -1) => void;
}

interface ReviewPagerViewProps {
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
  /** Reports the selected period's label up to the host header. */
  onActivePeriodLabelChange?: (label: string) => void;
}

const TREND_HEIGHT = 120;
const RING_SIZE = 76;
const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Dash slots making up the trend chart's average line. */
const AVERAGE_LINE_DASHES = Array.from({ length: 28 }, (_, index) => index);

export const ReviewPagerView = forwardRef<ReviewPagerViewHandle, ReviewPagerViewProps>(
  function ReviewPagerView({ onOpenTransaction, onActivePeriodLabelChange }, ref) {
    const { settings, categories, monthlyBudgets, getTrueHourlyRateForDate } = useApp();
    const { transactions: liveTransactions } = useTransactions();
    // The Insights tab stays mounted for the app's lifetime, so hold the last
    // value while hidden rather than re-aggregating on every write elsewhere.
    const transactions = useValueWhileTabVisible(liveTransactions);
    const themeColors = useThemeColors();

    const [zoom, setZoom] = useState<ReviewZoom>('week');
    // One remembered period per zoom, so switching Week -> Month -> Week comes
    // back to where the user was rather than jumping to the newest.
    const [selectedByZoom, setSelectedByZoom] = useState<Partial<Record<ReviewZoom, string>>>({});
    const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

    // A review reminder tap names the zoom it recapped.
    useEffect(() => {
      const pending = consumePendingReviewZoom();
      if (pending) setZoom(pending);
      return subscribeReviewZoomRequest((requested) => {
        setZoom(requested);
        // Land on the newest completed period, which is the one the reminder
        // was about, not wherever the user last browsed to.
        setSelectedByZoom((previous) => ({ ...previous, [requested]: undefined }));
      });
    }, []);

    // Day key of the oldest live row, which is where the period rail stops.
    // Normalized rather than compared as a raw ISO timestamp, so it lines up
    // with the `YYYY-MM-DD` bounds the period helpers work in.
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

    useImperativeHandle(
      ref,
      () => ({
        scrollToRelative: (direction) => {
          const nextIndex = selectedIndex + direction;
          if (nextIndex < 0 || nextIndex >= periods.length) return;
          void triggerHaptic('selection');
          selectPeriod(periods[nextIndex]);
        },
      }),
      [periods, selectPeriod, selectedIndex],
    );

    // The pace card and the delta need the periods *before* the selected one,
    // which can reach back past the rail's own window.
    const previousExpenses = useMemo(() => {
      if (!period) return [];
      const totals: number[] = [];
      for (let step = 1; step <= PACE_SAMPLE_SIZE[period.zoom]; step += 1) {
        totals.push(
          expenseTotalForPeriod(transactions, shiftPeriod(period, step, settings.firstDayOfMonth)),
        );
      }
      return totals;
    }, [period, settings.firstDayOfMonth, transactions]);

    const summary = useMemo(() => {
      if (!period) return null;
      const monthKey = monthKeyOfPeriod(period);
      const budget = monthKey
        ? monthlyBudgets.find((entry) => entry.month === monthKey && !entry.deletedAt)
        : null;
      return buildReviewSummary({
        period,
        transactions,
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
      transactions,
    ]);

    const periodLabel = period ? periodTitle(period, settings.locale) : '';
    useEffect(() => {
      onActivePeriodLabelChange?.(periodLabel);
    }, [onActivePeriodLabelChange, periodLabel]);

    const zoomOptions = useMemo(
      () =>
        REVIEW_ZOOMS.map((value) => ({
          value,
          label: I18n.t(`review.zoom.${value}`),
        })),
      [],
    );

    const openTransactionById = useCallback(
      (transactionId: string) => {
        const transaction = transactions.find((entry) => entry.id === transactionId);
        if (transaction) onOpenTransaction?.(transaction);
      },
      [onOpenTransaction, transactions],
    );

    const handleZoomChange = useCallback((next: ReviewZoom) => {
      void triggerHaptic('selection');
      setZoom(next);
      setExpandedCategoryId(null);
    }, []);

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
          <View style={styles.header}>
            <SegmentedToggle value={zoom} options={zoomOptions} onChange={handleZoomChange} />
            <PeriodRail
              periods={periods}
              selectedIndex={selectedIndex}
              locale={settings.locale}
              onSelect={selectPeriod}
              primary={themeColors.primary}
            />
            <Text variant="caption" tone="muted" className="px-1">
              {periodSubtitle(period, settings.locale)}
            </Text>
          </View>

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
              <KeptCard summary={summary} />
              <TrendCard summary={summary} />
              {summary.pace ? <PaceCard summary={summary} /> : null}
              <CategoriesCard
                summary={summary}
                expandedCategoryId={expandedCategoryId}
                onToggleCategory={setExpandedCategoryId}
                onOpenTransaction={onOpenTransaction ? openTransactionById : undefined}
              />
              <MoodCard summary={summary} />
              <StandoutsCard summary={summary} />
            </Animated.View>
          )}
        </TabletContentContainer>
      </ScrollView>
    );
  },
);

// ---------------------------------------------------------------------------
// Period rail
// ---------------------------------------------------------------------------

function PeriodRail({
  periods,
  selectedIndex,
  locale,
  onSelect,
  primary,
}: {
  periods: ReviewPeriod[];
  selectedIndex: number;
  locale: string;
  onSelect: (period: ReviewPeriod) => void;
  primary: string;
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
            style={isSelected ? { shadowColor: primary } : undefined}
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

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-3xl border border-border/25 bg-card shadow-soft" style={styles.card}>
      {children}
    </View>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" tone="muted" className="uppercase tracking-[1.4px]">
      {children}
    </Text>
  );
}

function SpentCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const { delta } = summary;
  const isLighter = delta ? delta.changeRatio < 0 : false;
  const deltaTint = !delta
    ? themeColors.textMuted
    : Math.round(delta.changeRatio * 100) === 0
      ? themeColors.textMuted
      : isLighter
        ? themeColors.success
        : themeColors.error;

  return (
    <Card>
      <CardLabel>{I18n.t(`review.spent_label.${summary.period.zoom}`)}</CardLabel>
      <View className="mt-2 flex-row flex-wrap items-center gap-2.5">
        <Text variant="display">{money(summary.expense, settings)}</Text>
        {delta ? (
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${deltaTint}22` }}>
            <Text variant="caption" style={{ color: deltaTint }}>
              {deltaLabel(delta.changeRatio)}
            </Text>
          </View>
        ) : null}
      </View>
      {delta ? (
        <Text variant="caption" tone="muted" className="mt-1">
          {deltaNote(delta.changeRatio, summary.period.zoom)}
        </Text>
      ) : null}

      {summary.hours !== null ? (
        <View
          className="mt-3 flex-row items-center gap-2.5 rounded-2xl bg-primary/10 px-3.5 py-2.5"
          style={[styles.timeStrip, { borderLeftColor: `${themeColors.primary}73` }]}
        >
          <ClayIcon name="ui/clock" size={18} />
          <View className="flex-1">
            <Text variant="bodyStrong" tone="primary">
              {I18n.t('review.hours_of_life', { hours: formatHours(summary.hours) })}
            </Text>
            <Text variant="caption" tone="muted" className="mt-0.5">
              {I18n.t('review.hourly_rate', {
                rate: money(summary.hourlyRate, settings),
              })}
            </Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function KeptCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const ratio = summary.savedRatio;
  // A negative saved ratio (spent more than came in) would wrap the ring past
  // its own start, so the arc clamps while the caption keeps the real number.
  const arc = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));

  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <View style={styles.ring}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={`${themeColors.border}99`}
              strokeWidth={8}
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={summary.net >= 0 ? themeColors.success : themeColors.error}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - arc)}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text variant="bodyStrong">
              {ratio === null ? I18n.t('review.not_applicable') : `${Math.round(ratio * 100)}%`}
            </Text>
            <Text variant="caption" tone="muted" className="uppercase tracking-[1px]">
              {I18n.t('review.kept')}
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
              {I18n.t('review.kept')}
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
    <Card>
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="bodyStrong">{trendTitle(summary.period.zoom)}</Text>
        <Text variant="caption" tone="muted">
          {I18n.t('review.trend_average', { amount: money(summary.barAverage, settings) })}
        </Text>
      </View>

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
                Native ignores `borderStyle: 'dashed'` on a single-side border
                on iOS, which rendered the average line as nothing at all. */}
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
    <Card>
      <View className="flex-row items-center justify-between gap-2">
        <CardLabel>
          {I18n.t(pace.kind === 'budget' ? 'review.pace_budget_label' : 'review.pace_label')}
        </CardLabel>
        <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: `${tint}22` }}>
          <Text variant="caption" style={{ color: tint }}>
            {paceBadgeLabel(pace, settings)}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-baseline justify-between gap-2">
        <Text variant="subheading" className="flex-1">
          {I18n.t(
            pace.kind === 'budget'
              ? 'review.pace_budget_title'
              : `review.pace_title.${summary.period.zoom}`,
          )}
        </Text>
        <Text variant="heading" style={{ color: tint }}>
          {pacePercentLabel(pace.ratio)}
        </Text>
      </View>

      <View className="mt-3 h-2 overflow-hidden rounded-full bg-border/55">
        <View
          className="h-2 rounded-full"
          style={{ width: `${Math.min(pace.ratio, 1) * 100}%`, backgroundColor: tint }}
        />
      </View>

      <Text variant="caption" tone="muted" className="mt-2">
        {pace.kind === 'budget'
          ? I18n.t('review.pace_of_budget', {
              spent: money(pace.spent, settings),
              target: money(pace.target, settings),
            })
          : I18n.t(`review.pace_average.${summary.period.zoom}`, {
              count: pace.sampleSize ?? 0,
              amount: money(pace.target, settings),
            })}
      </Text>
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
    <Card>
      <Text variant="bodyStrong">{I18n.t(`review.categories_title.${summary.period.zoom}`)}</Text>
      <View className="mt-3.5 gap-3">
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
        <View className="flex-1">
          <View className="flex-row items-baseline gap-2">
            <Text variant="body" numberOfLines={1} className="flex-1">
              {label}
            </Text>
            <Text variant="bodyStrong">{money(category.amount, settings)}</Text>
            <ChevronDown
              size={13}
              color={themeColors.textMuted}
              style={expanded ? styles.chevronOpen : undefined}
            />
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
            <Text variant="caption" tone="muted" style={styles.shareLabel}>
              {`${Math.round(category.share * 100)}%`}
            </Text>
          </View>
        </View>
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
  const hasAny = summary.sentiment.some((slice) => slice.amount > 0);
  if (!hasAny) return null;

  return (
    <Card>
      <Text variant="bodyStrong">{I18n.t(`review.mood_title.${summary.period.zoom}`)}</Text>

      <View className="mt-3.5 h-2.5 flex-row gap-0.5 overflow-hidden rounded-full">
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

function StandoutsCard({ summary }: { summary: ReviewSummary }) {
  const { settings } = useApp();
  const { standouts } = summary;

  const rows: { key: string; label: string; sub: string; value: string }[] = [];

  if (standouts.biggestExpense) {
    rows.push({
      key: 'biggest',
      label: I18n.t('review.biggest_expense'),
      sub: standouts.biggestExpense.label
        ? `${standouts.biggestExpense.label} · ${weekdayDayLabel(standouts.biggestExpense.dayKey, settings.locale)}`
        : weekdayDayLabel(standouts.biggestExpense.dayKey, settings.locale),
      value: money(standouts.biggestExpense.amount, settings),
    });
  }

  if (standouts.busiestDay) {
    rows.push({
      key: 'busiest',
      label: I18n.t('review.busiest_day'),
      sub: I18n.t('review.entries_count', { count: standouts.busiestDay.count }),
      value: weekdayDayLabel(standouts.busiestDay.dayKey, settings.locale),
    });
  }

  rows.push({
    key: 'quiet',
    label: I18n.t('review.quiet_days'),
    sub: I18n.t('review.quiet_days_sub'),
    value: I18n.t('review.of_total', {
      count: standouts.quietDayCount,
      total: standouts.totalDayCount,
    }),
  });

  rows.push({
    key: 'entries',
    label: I18n.t('review.entries_logged'),
    sub: I18n.t(`review.entries_logged_sub.${summary.period.zoom}`),
    value: String(standouts.entryCount),
  });

  return (
    <Card>
      <Text variant="bodyStrong">{I18n.t(`review.standouts_title.${summary.period.zoom}`)}</Text>
      <View className="mt-3 gap-3">
        {rows.map((row) => (
          <View key={row.key} className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text variant="caption" className="text-foreground">
                {row.label}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {row.sub}
              </Text>
            </View>
            <Text variant="bodyStrong">{row.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 140,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  railContent: {
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  cardStack: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
  },
  timeStrip: {
    borderLeftWidth: 3,
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
  trend: {
    marginTop: spacing.sm,
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
    marginLeft: 48,
    paddingLeft: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(148,163,159,0.3)',
    gap: spacing.xs,
  },
});
