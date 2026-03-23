import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Landmark,
  PiggyBank,
  Smile,
  TimerReset,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { AnimatedRollingNumber } from 'react-native-animated-rolling-numbers';
import { PieChart } from 'react-native-chart-kit';
import { type GraphPoint, LineGraph } from 'react-native-graph';
import { Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { Card, CardContent, SelectField, Text, ThemeModal, TimeValueInline } from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { LONG_RANGE_PAGER_CENTER_INDEX, LONG_RANGE_PAGER_TOTAL_SLOTS } from '~/constants/pager';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { RankedImpactChart, type RankedImpactRow } from '~/features/insights/components';
import { SentimentStackedBarChart } from '~/features/insights/components/SentimentStackedBarChart';
import { TrendBarChart } from '~/features/insights/components/TrendBarChart';
import { DisplayModeToggle } from '~/features/transactions/components';
import { AccountPanel, CategoryPanel, DatePanel } from '~/features/transactions/components/editor';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePersistedJsonSnapshot } from '~/hooks/usePersistedJsonSnapshot';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, Category, CategoryType, TransactionWithRelations, WageType } from '~/types';
import { cn } from '~/utils';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatCompactCurrency,
  formatDateInput,
  formatHours,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
  normalizeMonthKey,
  parseMonthKey,
  startOfMonthDate,
  toRange,
} from '~/utils/formatters';
import { filterTransactionsByWallet } from '~/utils/transactions';

import type { InsightsDrilldownPayload } from './InsightsDrilldownScreen';

const PERIOD_TABS = ['week', 'month', 'year', 'custom'] as const;
type PeriodPreset = (typeof PERIOD_TABS)[number];
const INSIGHT_TYPES = [
  'expense_breakdown',
  'income_breakdown',
  'calendar_view',
  'time_cost_leaderboard',
  'savings_rate',
  'expense_trend',
  'income_trend',
  'expense_sentiment',
  'asset_history',
  'income_rate_history',
] as const;
type InsightType = (typeof INSIGHT_TYPES)[number];
const INSIGHT_TYPE_GROUPS = [
  {
    id: 'breakdowns',
    insightTypes: ['expense_breakdown', 'income_breakdown'],
  },
  {
    id: 'activity',
    insightTypes: ['calendar_view', 'time_cost_leaderboard', 'savings_rate'],
  },
  {
    id: 'trends',
    insightTypes: [
      'expense_trend',
      'income_trend',
      'expense_sentiment',
      'asset_history',
      'income_rate_history',
    ],
  },
] as const satisfies readonly {
  id: string;
  insightTypes: readonly InsightType[];
}[];
type BreakdownInsightType = Extract<InsightType, 'expense_breakdown' | 'income_breakdown'>;
type NavigableInsightType = BreakdownInsightType | 'expense_trend' | 'expense_sentiment';
type AnalyticsInsightType = Extract<InsightType, 'savings_rate'>;
type BreakdownTransactionType = 'expense' | 'income';
type TimeCostViewMode = 'category' | 'transaction';
type IncomeRateDisplayUnit = 'hourly' | 'monthly' | 'yearly';
type DrilldownScopeMatcher = (transaction: TransactionWithRelations) => boolean;

const INSIGHT_TYPE_VISUALS = {
  expense_breakdown: {
    Icon: TrendingDown,
    tint: '#D24B36',
    background: '#FCE5E1',
    border: '#F4BAAF',
  },
  income_breakdown: {
    Icon: TrendingUp,
    tint: '#1D9B63',
    background: '#E3F7EB',
    border: '#B5E5CA',
  },
  calendar_view: {
    Icon: CalendarDays,
    tint: '#2D78DA',
    background: '#E4EEFF',
    border: '#B8CCF6',
  },
  time_cost_leaderboard: {
    Icon: TimerReset,
    tint: '#D47A16',
    background: '#FDEEDB',
    border: '#F4CFA7',
  },
  savings_rate: {
    Icon: PiggyBank,
    tint: '#1B8D74',
    background: '#DFF6F1',
    border: '#A4E0D3',
  },
  expense_trend: {
    Icon: TrendingDown,
    tint: '#D65E43',
    background: '#FCE7E2',
    border: '#F3B8AB',
  },
  income_trend: {
    Icon: TrendingUp,
    tint: '#249A67',
    background: '#E4F7EC',
    border: '#B7E4CA',
  },
  expense_sentiment: {
    Icon: Smile,
    tint: '#C76A2E',
    background: '#FFF3E8',
    border: '#F4CFA7',
  },
  asset_history: {
    Icon: Landmark,
    tint: '#6B5ECA',
    background: '#E9E7FF',
    border: '#C9C2FA',
  },
  income_rate_history: {
    Icon: HandCoins,
    tint: '#B86A16',
    background: '#FDEFD9',
    border: '#F0CDA0',
  },
} as const satisfies Record<
  InsightType,
  {
    Icon: typeof TrendingUp;
    tint: string;
    background: string;
    border: string;
  }
>;

function renderInsightTypeIcon(insightType: InsightType) {
  const visual = INSIGHT_TYPE_VISUALS[insightType];
  const Icon = visual.Icon;
  return (
    <View
      className="h-8 w-8 items-center justify-center rounded-lg border"
      style={{ backgroundColor: visual.background, borderColor: visual.border }}
    >
      <Icon size={16} color={visual.tint} />
    </View>
  );
}

const TIME_COST_RANK_ACCENTS = [
  '#D9623B',
  '#E8893E',
  '#E8B54C',
  '#8DB650',
  '#3FA788',
  '#3F8FA0',
  '#4B78AF',
  '#5C6D8A',
];

const INSIGHTS_CHART_COLORS = [
  '#E53935', // red
  '#FB8C00', // orange
  '#FDD835', // yellow
  '#43A047', // green
  '#00897B', // teal
  '#00ACC1', // cyan
  '#1E88E5', // blue
  '#3949AB', // indigo
  '#8E24AA', // violet
  '#D81B60', // magenta
  '#6D4C41', // brown
  '#546E7A', // slate
];

const INSIGHTS_PAGER_TOTAL_SLOTS = LONG_RANGE_PAGER_TOTAL_SLOTS;
const INSIGHTS_PAGER_CENTER_INDEX = LONG_RANGE_PAGER_CENTER_INDEX;
const INSIGHTS_LIST_STYLE = { flex: 1 } as const;
const INSIGHTS_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: spacing.screenHorizontal,
  paddingBottom: LIST_BOTTOM_PADDING,
  paddingTop: spacing.xxs,
} as const;
const FILTER_SELECTION_PANEL_CLASS =
  'rounded-[18px] border-2 border-border/60 bg-card/80 shadow-soft overflow-hidden';
const ASSET_HISTORY_CHART_HEIGHT = 226;
const ASSET_HISTORY_CHART_PADDING_RIGHT = 64;
const EXPENSE_TREND_CHART_HEIGHT = 226;
const EXPENSE_TREND_CHART_PADDING_RIGHT = 64;
const SENTIMENT_CHART_HEIGHT = 200;
const SENTIMENT_CHART_PADDING_RIGHT = 16;
const SENTIMENT_COLORS = { happy: '#4CAF50', neutral: '#FFB74D', sad: '#E57373' } as const;
const INCOME_RATE_CHART_HEIGHT = 200;
const INCOME_RATE_CHART_PADDING_RIGHT = 64;
const INSIGHTS_LINE_CHART_SIDE_INSET = 8;
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const INSIGHTS_LINE_CHART_SECTION_BLEED = 10;
const GRAPH_HORIZONTAL_PADDING = 8;
const GRAPH_VERTICAL_PADDING = 14;
const Y_AXIS_LABEL_BASE_FONT_SIZE = 9.5;
const Y_AXIS_LABEL_MIN_FONT_SIZE = 7.5;
const CHART_SKELETON_READY_DELAY_MS = 180;
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;
const DEFAULT_HOURS_PER_WEEK = 40;
const HEALTHY_SAVINGS_RATE_THRESHOLD = 0.2;
const INSIGHTS_ROLLING_NUMBER_TEXT_STYLE = {
  fontSize: 24,
  lineHeight: 30,
  fontWeight: '700' as const,
};
const INSIGHTS_ROLLING_NUMBER_SPIN_CONFIG = {
  duration: 90,
  easing: Easing.out(Easing.cubic),
} as const;
const INSIGHTS_FILTER_MODAL_CONTENT_STYLE = {
  padding: spacing.screenHorizontal,
  paddingBottom: LIST_BOTTOM_PADDING + spacing.xs,
  gap: spacing.sm,
} as const;
const EMPTY_ASSET_HISTORY_MONTHLY_DELTAS = new Map<string, Map<string, number>>();
const WEEKDAY_LABELS_CACHE = new Map<string, string[]>();
const YEAR_MONTH_LABELS_CACHE = new Map<string, string[]>();
const MONTH_LABEL_BY_KEY_CACHE = new Map<string, string>();
const CALENDAR_DATE_LABEL_CACHE = new Map<string, string>();
const PERIOD_MONTH_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_MONTH_DAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_PICKER_SIDE_MARGIN = 12;
const PERIOD_PICKER_CARD_WIDTH = 408;

const styles = StyleSheet.create({
  absoluteOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  chartSizeCenter: {
    alignSelf: 'center',
  },
  graphYAxisRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
  },
  graphYAxisDot: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 2,
    borderRadius: 1,
  },
  chartReferenceLine: {
    position: 'absolute',
    left: GRAPH_HORIZONTAL_PADDING,
    right: GRAPH_HORIZONTAL_PADDING,
    borderTopWidth: 1.5,
    borderStyle: 'dotted',
  },
  graphYAxisLabelContainer: {
    position: 'absolute',
    right: 0,
  },
  graphYAxisLabel: {
    textAlign: 'right',
  },
  chartSkeletonFill: {
    position: 'absolute',
    left: GRAPH_HORIZONTAL_PADDING,
    top: GRAPH_VERTICAL_PADDING,
    borderRadius: 14,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  chartRuntimeFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  pieFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieLabel: {
    position: 'absolute',
  },
  breakdownPercentBadge: {
    borderRadius: 999,
  },
  calendarWeekdayCell: {
    alignItems: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    borderRadius: 12,
    alignItems: 'center',
    paddingTop: 6,
  },
  calendarActivityDot: {
    marginTop: 4,
    borderRadius: 999,
  },
  calendarEmojiCircle: {
    marginTop: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarEmojiLabel: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  savingsRateHealthyMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  insightsFilterModalHeader: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.xl + spacing.xs,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  insightsFilterActionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  insightsFilterPillsContent: {
    gap: spacing.xs,
  },
  insightsFilterDatePanel: {
    height: 360,
  },
  insightsFilterSelectionPanel: {
    height: 236,
  },
  incomeRateUnitPickerSheet: {
    marginHorizontal: spacing.screenHorizontal,
    marginBottom: spacing.xl + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  periodPickerCard: {
    position: 'absolute',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 18,
  },
  periodPickerGridItem: {
    width: '31.6%',
  },
});

function buildSizeStyle(width: number, height: number) {
  return { width, height };
}

function buildWidthStyle(width: number | `${number}%`) {
  return { width };
}

function buildLeftStyle(left: number | `${number}%`) {
  return { left };
}

function serializeRecordForSignature(record: Record<string, string>) {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
}

function clampNumber(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

type PeriodPickerAnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PeriodPickerCommitPayload = {
  preset: PeriodPreset;
  anchorDate: Date;
  customStart?: string;
  customEnd?: string;
  activeCustomDateField?: 'start' | 'end';
};

type WeekPickerOption = {
  key: string;
  range: { start: string; end: string };
  dayKeys: string[];
  anchorDate: Date;
};

function yearPickerPageStartFromYear(year: number) {
  return Math.floor(year / MONTHS_PER_YEAR) * MONTHS_PER_YEAR;
}

function buildWeekPickerOptions(monthDate: Date): WeekPickerOption[] {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const lastWeekStart = startOfWeekMondayDate(monthEnd);
  const rows: WeekPickerOption[] = [];
  const cursor = startOfWeekMondayDate(monthStart);

  while (cursor.getTime() <= lastWeekStart.getTime()) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const range = toRange(weekStart, weekEnd);
    const dayKeys = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + index);
      return formatDateInput(day);
    });

    rows.push({
      key: `${dayKeys[0]}|${dayKeys[6]}`,
      range,
      dayKeys,
      anchorDate: startOfDayDate(weekEnd),
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  return rows;
}

type InsightFilterConfig = {
  fixedPeriodPreset: PeriodPreset | null;
  allowAccountFilter: boolean;
  allowedPeriodPresets?: readonly PeriodPreset[];
};

const DEFAULT_INSIGHT_FILTER_CONFIG: InsightFilterConfig = {
  fixedPeriodPreset: null,
  allowAccountFilter: true,
};

const INSIGHT_FILTER_CONFIG: Partial<Record<InsightType, InsightFilterConfig>> = {
  expense_breakdown: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
  },
  income_breakdown: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
  },
  savings_rate: {
    fixedPeriodPreset: 'year',
    allowAccountFilter: false,
  },
  expense_trend: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
    allowedPeriodPresets: ['week', 'year', 'custom'] as const,
  },
  income_trend: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
    allowedPeriodPresets: ['week', 'year', 'custom'] as const,
  },
  expense_sentiment: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
    allowedPeriodPresets: ['week', 'month', 'custom'] as const,
  },
  asset_history: {
    fixedPeriodPreset: 'year',
    allowAccountFilter: false,
  },
  income_rate_history: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
  },
  calendar_view: {
    fixedPeriodPreset: 'month',
    allowAccountFilter: false,
  },
  time_cost_leaderboard: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
  },
};

function getInsightFilterConfig(insightType: InsightType): InsightFilterConfig {
  return INSIGHT_FILTER_CONFIG[insightType] ?? DEFAULT_INSIGHT_FILTER_CONFIG;
}

const DEFAULT_PERIOD_PRESET_BY_INSIGHT: Partial<Record<InsightType, PeriodPreset>> = {
  expense_trend: 'year',
  income_trend: 'year',
  expense_sentiment: 'week',
};

function getDefaultPeriodPreset(insightType: InsightType): PeriodPreset {
  const config = getInsightFilterConfig(insightType);
  if (config.fixedPeriodPreset) return config.fixedPeriodPreset;
  return DEFAULT_PERIOD_PRESET_BY_INSIGHT[insightType] ?? 'month';
}

function getHydratedInsightPeriodPreset(
  saved: Partial<InsightsPreferencesSnapshot>,
  fallbackInsightType: InsightType = 'expense_breakdown',
): PeriodPreset {
  const insightType = saved.selectedInsightType ?? fallbackInsightType;
  const fixedPreset = getInsightFilterConfig(insightType).fixedPeriodPreset;
  if (fixedPreset) return fixedPreset;

  return (
    saved.periodPresetByInsight?.[insightType] ??
    (saved.selectedInsightType === insightType ? saved.periodPreset : undefined) ??
    getDefaultPeriodPreset(insightType)
  );
}

function isInsightType(value: string): value is InsightType {
  return INSIGHT_TYPES.some((insightType) => insightType === value);
}

function isPeriodPreset(value: string): value is PeriodPreset {
  return PERIOD_TABS.some((preset) => preset === value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toggleStringId(previous: string[], targetId: string): string[] {
  const index = previous.indexOf(targetId);
  if (index === -1) return [...previous, targetId];
  if (previous.length === 1) return [];
  const next = [...previous];
  next.splice(index, 1);
  return next;
}

type InsightCategoryRow = {
  id: string;
  label: string;
  amount: number;
  count: number;
  emoji: string;
};

type InsightBasePageData = {
  range: { start: string; end: string };
  filteredForRange: TransactionWithRelations[];
};

type BreakdownPageData = InsightBasePageData & {
  kind: 'breakdown';
  categoryRows: InsightCategoryRow[];
  breakdownTransactionsById: Map<string, TransactionWithRelations[]>;
  transactionType: BreakdownTransactionType;
};

type CalendarDayAggregate = {
  dayKey: string;
  income: number;
  expense: number;
  net: number;
  transactions: TransactionWithRelations[];
};

type CalendarDayCell = {
  kind: 'day';
  id: string;
  dayKey: string;
  dayNumber: number;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  isOutsideRange: boolean;
  isFuture: boolean;
  expenseDotTier: 0 | 1 | 2 | 3 | 4 | 5;
  topCategoryEmoji: string | null;
};

function clampCalendarExpenseDotTier(tier: number): 1 | 2 | 3 | 4 | 5 {
  if (tier <= 1) return 1;
  if (tier >= 5) return 5;
  if (tier < 2.5) return 2;
  if (tier < 3.5) return 3;
  if (tier < 4.5) return 4;
  return 5;
}

type CalendarSpacerCell = {
  kind: 'spacer';
  id: string;
};

type CalendarGridCell = CalendarDayCell | CalendarSpacerCell;

type CalendarMonthSection = {
  monthKey: string;
  label: string;
  activeDayCount: number;
  cells: CalendarGridCell[];
};

type CalendarPageData = InsightBasePageData & {
  kind: 'calendar';
  dailyTotalsByDayKey: Map<string, CalendarDayAggregate>;
  monthSections: CalendarMonthSection[];
  rangeStartDayKey: string;
  rangeEndDayKey: string;
  defaultSelectedDayKey: string;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
};

type TimeCostCategoryRow = {
  id: string;
  label: string;
  emoji: string;
  hours: number;
  amount: number;
  count: number;
  sharePct: number;
  transactions: TransactionWithRelations[];
};

type TimeCostTransactionRow = {
  id: string;
  transaction: TransactionWithRelations;
  label: string;
  subtitle: string;
  hours: number;
  amount: number;
  sharePct: number;
};

type TimeCostPageData = InsightBasePageData & {
  kind: 'time_cost';
  hasTimeContext: boolean;
  totalHours: number;
  totalAmount: number;
  categoryRows: TimeCostCategoryRow[];
  transactionRows: TimeCostTransactionRow[];
};

type InsightAnalyticsDayRow = {
  dayKey: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  transactions: TransactionWithRelations[];
};

type InsightAnalyticsSavingsRateMonthRow = {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  transactions: TransactionWithRelations[];
};

interface InsightsCategoryPanelItem {
  id: string;
  name: string;
  icon: string;
}

interface InsightsCategoryPanelData {
  parents: InsightsCategoryPanelItem[];
  childByParent: Map<string, InsightsCategoryPanelItem[]>;
}

function buildInsightsCategoryPanelData(
  categories: Category[],
  categoryType: CategoryType,
): InsightsCategoryPanelData {
  const parentCategories = categories.filter(
    (category) => category.type === categoryType && category.parentId === null,
  );
  const parentIds = new Set(parentCategories.map((parent) => parent.id));
  const parents = parentCategories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon || '•',
  }));
  const childByParent = new Map<string, InsightsCategoryPanelItem[]>();

  categories.forEach((category) => {
    const parentId = category.parentId;
    if (category.type !== categoryType || !parentId || !parentIds.has(parentId)) return;
    const existing = childByParent.get(parentId);
    const child = { id: category.id, name: category.name, icon: category.icon || '•' };
    if (existing) {
      existing.push(child);
    } else {
      childByParent.set(parentId, [child]);
    }
  });

  return { parents, childByParent };
}

type AssetHistoryMonthRow = {
  monthKey: string;
  label: string;
  totalAssets: number;
};

type ExpenseTrendMonthRow = {
  monthKey: string;
  axisLabel: string;
  axisSubLabel: string | null;
  label: string;
  totalExpense: number;
  transactionCount: number;
  topCategoryLabel: string | null;
  topCategoryEmoji: string | null;
  topCategoryAmount: number;
  transactions: TransactionWithRelations[];
};

type AnalyticsPageData = InsightBasePageData & {
  kind: 'analytics';
  insightType: AnalyticsInsightType;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  periodDays: number;
  dailyRows: InsightAnalyticsDayRow[];
  savingsRateRows: InsightAnalyticsSavingsRateMonthRow[];
};

type AssetHistoryPageData = InsightBasePageData & {
  kind: 'asset_history';
  year: number;
  monthRows: AssetHistoryMonthRow[];
  includedAccountsCount: number;
};

type TrendGranularity = 'month' | 'day';

type ExpenseTrendPageData = InsightBasePageData & {
  kind: 'expense_trend';
  year: number;
  periodKey: string;
  granularity: TrendGranularity;
  monthRows: ExpenseTrendMonthRow[];
  averageMonthExpense: number;
  activeMonths: number;
  peakMonthKey: string | null;
};

type IncomeTrendMonthRow = {
  monthKey: string;
  axisLabel: string;
  axisSubLabel: string | null;
  label: string;
  totalIncome: number;
  transactionCount: number;
  topCategoryLabel: string | null;
  topCategoryEmoji: string | null;
  topCategoryAmount: number;
  transactions: TransactionWithRelations[];
};

type IncomeTrendPageData = InsightBasePageData & {
  kind: 'income_trend';
  year: number;
  periodKey: string;
  granularity: TrendGranularity;
  monthRows: IncomeTrendMonthRow[];
  averageMonthIncome: number;
  activeMonths: number;
  peakMonthKey: string | null;
};

type SentimentDayRow = {
  dayKey: string;
  label: string;
  subLabel: string | null;
  happy: number;
  neutral: number;
  sad: number;
  total: number;
};

type ExpenseSentimentPageData = InsightBasePageData & {
  kind: 'expense_sentiment';
  dayRows: SentimentDayRow[];
  totals: { happy: number; neutral: number; sad: number };
};

type IncomeRatePoint = {
  monthKey: string;
  label: string;
  wageAmount: number;
  wageType: WageType;
  hoursWorkedPerWeek: number;
};

type IncomeRateHistoryPageData = InsightBasePageData & {
  kind: 'income_rate_history';
  points: IncomeRatePoint[];
};

type InsightPageData =
  | BreakdownPageData
  | CalendarPageData
  | TimeCostPageData
  | AnalyticsPageData
  | ExpenseTrendPageData
  | IncomeTrendPageData
  | ExpenseSentimentPageData
  | AssetHistoryPageData
  | IncomeRateHistoryPageData;
type PeriodState = { anchorDate: Date; customStart: string; customEnd: string };

function startOfDayDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeekMondayDate(date: Date): Date {
  const day = startOfDayDate(date);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

function buildMonthPeriodState(targetMonthDate: Date): PeriodState {
  const monthStart = startOfMonthDate(targetMonthDate);
  return {
    anchorDate: monthStart,
    customStart: formatDateInput(monthStart),
    customEnd: formatDateInput(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)),
  };
}

function buildDayPeriodState(targetDate: Date): PeriodState {
  const day = startOfDayDate(targetDate);
  const dayKey = formatDateInput(day);
  return {
    anchorDate: day,
    customStart: dayKey,
    customEnd: dayKey,
  };
}

type InsightsPreferencesSnapshot = {
  version: 1;
  selectedInsightType: InsightType;
  periodPreset: PeriodPreset;
  periodPresetByInsight: Partial<Record<InsightType, PeriodPreset>>;
  anchorDate: string;
  customStart: string;
  customEnd: string;
  activeCustomDateField: 'start' | 'end';
  selectedAccountIds: string[];
  excludedExpenseTrendAccountIds: string[];
  excludedExpenseTrendExpenseCategoryIds: string[];
  excludedIncomeTrendAccountIds: string[];
  excludedIncomeTrendIncomeCategoryIds: string[];
  excludedSavingsIncomeCategoryIds: string[];
  excludedSavingsExpenseCategoryIds: string[];
  excludedTimeCostExpenseCategoryId: string | null;
  excludedAssetHistoryAccountIds: string[];
  timeCostViewMode: TimeCostViewMode;
};

const INSIGHTS_PREFERENCES_VERSION = 1;

function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push(trimmed);
  });
  return next;
}

function parseInsightsPreferencesPayload(
  rawValue: string | null,
): Partial<InsightsPreferencesSnapshot> | null {
  if (!rawValue) return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!isObjectRecord(parsed)) return null;

    const next: Partial<InsightsPreferencesSnapshot> = {};
    if (
      typeof parsed.selectedInsightType === 'string' &&
      isInsightType(parsed.selectedInsightType)
    ) {
      next.selectedInsightType = parsed.selectedInsightType;
    }
    if (typeof parsed.periodPreset === 'string' && isPeriodPreset(parsed.periodPreset)) {
      next.periodPreset = parsed.periodPreset;
    }
    if (isObjectRecord(parsed.periodPresetByInsight)) {
      const map: Partial<Record<InsightType, PeriodPreset>> = {};
      for (const [key, val] of Object.entries(parsed.periodPresetByInsight)) {
        if (isInsightType(key) && typeof val === 'string' && isPeriodPreset(val)) {
          map[key as InsightType] = val;
        }
      }
      if (Object.keys(map).length > 0) next.periodPresetByInsight = map;
    }
    if (typeof parsed.anchorDate === 'string' && parseDateInput(parsed.anchorDate)) {
      next.anchorDate = parsed.anchorDate;
    }
    if (typeof parsed.customStart === 'string' && parseDateInput(parsed.customStart)) {
      next.customStart = parsed.customStart;
    }
    if (typeof parsed.customEnd === 'string' && parseDateInput(parsed.customEnd)) {
      next.customEnd = parsed.customEnd;
    }
    if (parsed.activeCustomDateField === 'start' || parsed.activeCustomDateField === 'end') {
      next.activeCustomDateField = parsed.activeCustomDateField;
    }
    if (parsed.timeCostViewMode === 'category' || parsed.timeCostViewMode === 'transaction') {
      next.timeCostViewMode = parsed.timeCostViewMode;
    }

    next.selectedAccountIds = toUniqueStringList(parsed.selectedAccountIds);
    next.excludedExpenseTrendAccountIds = toUniqueStringList(parsed.excludedExpenseTrendAccountIds);
    next.excludedExpenseTrendExpenseCategoryIds = toUniqueStringList(
      parsed.excludedExpenseTrendExpenseCategoryIds,
    );
    next.excludedIncomeTrendAccountIds = toUniqueStringList(parsed.excludedIncomeTrendAccountIds);
    next.excludedIncomeTrendIncomeCategoryIds = toUniqueStringList(
      parsed.excludedIncomeTrendIncomeCategoryIds,
    );
    next.excludedSavingsIncomeCategoryIds = toUniqueStringList(
      parsed.excludedSavingsIncomeCategoryIds,
    );
    next.excludedSavingsExpenseCategoryIds = toUniqueStringList(
      parsed.excludedSavingsExpenseCategoryIds,
    );
    if (Object.prototype.hasOwnProperty.call(parsed, 'excludedAssetHistoryAccountIds')) {
      next.excludedAssetHistoryAccountIds = toUniqueStringList(
        parsed.excludedAssetHistoryAccountIds,
      );
    }
    if (typeof parsed.excludedTimeCostExpenseCategoryId === 'string') {
      const normalized = parsed.excludedTimeCostExpenseCategoryId.trim();
      if (normalized) {
        next.excludedTimeCostExpenseCategoryId = normalized;
      }
    }

    return next;
  } catch {
    return null;
  }
}

function isBreakdownInsightType(type: InsightType): type is BreakdownInsightType {
  return type === 'expense_breakdown' || type === 'income_breakdown';
}

function isAnalyticsInsightType(type: InsightType): type is AnalyticsInsightType {
  return type === 'savings_rate';
}

function transactionTypeFromInsightType(type: BreakdownInsightType): BreakdownTransactionType {
  return type === 'income_breakdown' ? 'income' : 'expense';
}

function parseDateInput(dateText: string): Date | null {
  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day)
    return null;
  return parsed;
}

function buildCustomPeriodState(
  customStart: string,
  customEnd: string,
  anchorDate: Date | null = null,
): PeriodState | null {
  const startDate = parseDateInput(customStart);
  const endDate = parseDateInput(customEnd);
  if (!startDate || !endDate || startDate > endDate) return null;

  return {
    anchorDate: startOfDayDate(anchorDate ?? endDate),
    customStart,
    customEnd,
  };
}

function resolveActivityInsightPeriodState(request: {
  monthKey: string;
  anchorDateKey?: string;
  customStart?: string;
  customEnd?: string;
  periodPreset?: PeriodPreset;
}): PeriodState {
  const parsedAnchorDate = request.anchorDateKey ? parseDateInput(request.anchorDateKey) : null;

  if (request.periodPreset === 'custom' && request.customStart && request.customEnd) {
    const customState = buildCustomPeriodState(
      request.customStart,
      request.customEnd,
      parsedAnchorDate,
    );
    if (customState) return customState;
  }

  if (parsedAnchorDate) {
    return buildDayPeriodState(parsedAnchorDate);
  }

  const monthDate = parseMonthKey(request.monthKey) ?? startOfMonthDate(new Date());
  return buildMonthPeriodState(monthDate);
}

function addPeriodBySteps(date: Date, preset: Exclude<PeriodPreset, 'custom'>, steps: number) {
  const next = new Date(date);
  if (preset === 'week') next.setDate(next.getDate() + 7 * steps);
  if (preset === 'month') next.setMonth(next.getMonth() + steps);
  if (preset === 'year') next.setFullYear(next.getFullYear() + steps);
  return next;
}

function getPeriodRange(
  preset: PeriodPreset,
  anchorDate: Date,
  customStart: string,
  customEnd: string,
) {
  if (preset === 'custom') {
    const startDate = parseDateInput(customStart);
    const endDate = parseDateInput(customEnd);
    if (startDate && endDate && startDate <= endDate) return toRange(startDate, endDate);
  }
  if (preset === 'week') {
    const start = startOfWeekMondayDate(anchorDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return toRange(start, end);
  }
  if (preset === 'month') {
    const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return toRange(start, end);
  }
  const start = new Date(anchorDate.getFullYear(), 0, 1);
  const end = new Date(anchorDate.getFullYear(), 11, 31);
  return toRange(start, end);
}

function periodLabel(preset: PeriodPreset, range: { start: string; end: string }, locale: string) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (preset === 'month') {
    let formatter = PERIOD_MONTH_YEAR_FORMATTER_CACHE.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
      PERIOD_MONTH_YEAR_FORMATTER_CACHE.set(locale, formatter);
    }
    return formatter.format(start);
  }
  if (preset === 'year') {
    let formatter = PERIOD_YEAR_FORMATTER_CACHE.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, { year: 'numeric' });
      PERIOD_YEAR_FORMATTER_CACHE.set(locale, formatter);
    }
    return formatter.format(start);
  }
  let formatter = PERIOD_MONTH_DAY_FORMATTER_CACHE.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    PERIOD_MONTH_DAY_FORMATTER_CACHE.set(locale, formatter);
  }
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function rangeLengthDays(range: { start: string; end: string }) {
  const startDate = parseDateInput(dayKeyFromIsoLocal(range.start));
  const endDate = parseDateInput(dayKeyFromIsoLocal(range.end));
  if (!startDate || !endDate) return 1;

  return Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );
}

function resolveWeekAnchorDateFromRange(range: { start: string; end: string }) {
  const rangeEndDate = parseDateInput(dayKeyFromIsoLocal(range.end));
  const today = startOfDayDate(new Date());
  if (!rangeEndDate) return today;
  return rangeEndDate.getTime() > today.getTime() ? today : rangeEndDate;
}

function getCalendarWeekdayLabels(locale: string) {
  const cached = WEEKDAY_LABELS_CACHE.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const monday = new Date(Date.UTC(2024, 0, 1)); // Monday
  const labels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatter.format(date);
  });
  WEEKDAY_LABELS_CACHE.set(locale, labels);
  return labels;
}

function dayKeyToUtcDate(dayKey: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKeyFromDayKey(dayKey: string) {
  return dayKey.slice(0, 7);
}

function monthStartUtcDateFromMonthKey(monthKey: string): Date | null {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabelFromMonthKey(monthKey: string, locale: string) {
  const cacheKey = `${locale}|${monthKey}`;
  const cached = MONTH_LABEL_BY_KEY_CACHE.get(cacheKey);
  if (cached) return cached;
  const monthStart = monthStartUtcDateFromMonthKey(monthKey);
  if (!monthStart) return monthKey;
  const label = monthStart.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  MONTH_LABEL_BY_KEY_CACHE.set(cacheKey, label);
  return label;
}

function monthLabelsForYear(year: number, locale: string): string[] {
  const cacheKey = `${locale}|${year}`;
  const cached = YEAR_MONTH_LABELS_CACHE.get(cacheKey);
  if (cached) return cached;

  const labels = Array.from({ length: 12 }, (_, monthIndex) =>
    new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(locale, {
      month: 'short',
      timeZone: 'UTC',
    }),
  );
  YEAR_MONTH_LABELS_CACHE.set(cacheKey, labels);
  return labels;
}

const DAY_LABEL_CACHE = new Map<string, string>();

function dayLabelShort(dayKey: string, locale: string): string {
  const cacheKey = `${locale}|${dayKey}`;
  const cached = DAY_LABEL_CACHE.get(cacheKey);
  if (cached) return cached;
  const parts = dayKey.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const label = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  DAY_LABEL_CACHE.set(cacheKey, label);
  return label;
}

const WEEKDAY_LABEL_CACHE = new Map<string, string>();

function weekdayLabelShort(dayKey: string, locale: string): string {
  const cacheKey = `${locale}|${dayKey}`;
  const cached = WEEKDAY_LABEL_CACHE.get(cacheKey);
  if (cached) return cached;
  const parts = dayKey.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const label = date.toLocaleDateString(locale, { weekday: 'short' });
  WEEKDAY_LABEL_CACHE.set(cacheKey, label);
  return label;
}

const DAY_NUMBER_LABEL_CACHE = new Map<string, string>();

function dayNumberLabel(dayKey: string): string {
  const cached = DAY_NUMBER_LABEL_CACHE.get(dayKey);
  if (cached) return cached;
  const label = String(Number(dayKey.split('-')[2]));
  DAY_NUMBER_LABEL_CACHE.set(dayKey, label);
  return label;
}

const NUMERIC_DATE_LABEL_CACHE = new Map<string, string>();

function numericDateLabelShort(dayKey: string, locale: string): string {
  const cacheKey = `${locale}|${dayKey}`;
  const cached = NUMERIC_DATE_LABEL_CACHE.get(cacheKey);
  if (cached) return cached;
  const parts = dayKey.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const label = date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  NUMERIC_DATE_LABEL_CACHE.set(cacheKey, label);
  return label;
}

function generateDayKeysForRange(startIso: string, endIso: string): string[] {
  const keys: string[] = [];
  const startDayKey = dayKeyFromIsoLocal(startIso);
  const endDayKey = dayKeyFromIsoLocal(endIso);
  const parts = startDayKey.split('-');
  const cursor = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const endParts = endDayKey.split('-');
  const endDate = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));
  while (cursor <= endDate) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function weekdayColumnIndexMonday(dayKey: string) {
  const date = dayKeyToUtcDate(dayKey);
  if (!date) return 0;
  const sundayFirst = date.getUTCDay();
  return (sundayFirst + 6) % 7;
}

function monthKeyFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatCalendarDate(dayKey: string, locale: string) {
  const currentUtcYear = new Date().getUTCFullYear();
  const cacheKey = `${locale}|${currentUtcYear}|${dayKey}`;
  const cached = CALENDAR_DATE_LABEL_CACHE.get(cacheKey);
  if (cached) return cached;

  const dayDate = dayKeyToUtcDate(dayKey);
  if (!dayDate) return dayKey;
  const label = dayDate.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: dayDate.getUTCFullYear() !== currentUtcYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
  CALENDAR_DATE_LABEL_CACHE.set(cacheKey, label);
  return label;
}

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function isLegacyBalanceAdjustmentTransfer(
  transaction: Pick<
    TransactionWithRelations,
    'type' | 'accountId' | 'fromAccountId' | 'toAccountId'
  >,
) {
  return (
    transaction.type === 'transfer' &&
    !!transaction.accountId &&
    !transaction.fromAccountId &&
    !transaction.toAccountId
  );
}

function resolveBreakdownRootId(
  transaction: Pick<TransactionWithRelations, 'categoryId' | 'categoryName' | 'categoryParentName'>,
  categoryById: Map<string, Category>,
) {
  const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : null;
  const root = category?.parentId ? categoryById.get(category.parentId) : category;
  const fallbackRootLabel = transaction.categoryParentName ?? transaction.categoryName ?? null;
  const fallbackRootKey = fallbackRootLabel
    ? `legacy-root:${fallbackRootLabel.toLowerCase()}`
    : null;
  return root?.id ?? fallbackRootKey ?? 'uncategorized';
}

function pieSliceIdFromTouch(
  point: { x: number; y: number },
  slices: { id: string; amount: number }[],
  totalAmount: number,
  chartSize: number,
) {
  if (slices.length === 0 || totalAmount <= 0) return null;
  const center = chartSize / 2;
  const radius = chartSize / 2.5;
  const dx = point.x - center;
  const dy = point.y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > radius) return null;

  const fullCircle = Math.PI * 2;
  const startAngle = -Math.PI / 2;
  let normalizedAngle = Math.atan2(dy, dx) - startAngle;
  if (normalizedAngle < 0) normalizedAngle += fullCircle;

  let cursor = 0;
  for (const slice of slices) {
    cursor += (slice.amount / totalAmount) * fullCircle;
    if (normalizedAngle <= cursor) return slice.id;
  }
  return slices[slices.length - 1]?.id ?? null;
}

function normalizeHoursPerWeek(hoursWorkedPerWeek: number) {
  if (!Number.isFinite(hoursWorkedPerWeek) || hoursWorkedPerWeek <= 0) {
    return DEFAULT_HOURS_PER_WEEK;
  }
  return hoursWorkedPerWeek;
}

function wageAmountToYearly(wageAmount: number, wageType: WageType, hoursWorkedPerWeek: number) {
  if (wageAmount <= 0) return 0;
  if (wageType === 'yearly') return wageAmount;
  if (wageType === 'monthly') return wageAmount * MONTHS_PER_YEAR;

  const safeHoursPerWeek = normalizeHoursPerWeek(hoursWorkedPerWeek);
  return wageAmount * safeHoursPerWeek * WEEKS_PER_YEAR;
}

function convertIncomeRateByUnit(
  wageAmount: number,
  wageType: WageType,
  hoursWorkedPerWeek: number,
  unit: IncomeRateDisplayUnit,
) {
  const yearlyAmount = wageAmountToYearly(wageAmount, wageType, hoursWorkedPerWeek);
  if (unit === 'yearly') return yearlyAmount;
  if (unit === wageType) return wageAmount;
  if (unit === 'hourly') {
    const safeHoursPerWeek = normalizeHoursPerWeek(hoursWorkedPerWeek);
    return yearlyAmount / (safeHoursPerWeek * WEEKS_PER_YEAR);
  }
  return yearlyAmount / MONTHS_PER_YEAR;
}

function incomeRateUnitSuffix(unit: IncomeRateDisplayUnit) {
  if (unit === 'hourly') return '/hr';
  if (unit === 'monthly') return '/mo';
  return '/yr';
}

function monthDateFromMonthKey(monthKey: string): Date {
  return parseMonthKey(monthKey) ?? new Date(1970, 0, 1);
}

type GraphAxisTick = {
  value: number;
  top: number;
};

type GraphLineRange = {
  x?: { min: Date; max: Date };
  y?: { min: number; max: number };
};

function resolveYAxisLabelFontSize(labels: string[], labelWidth: number) {
  if (labels.length === 0 || labelWidth <= 0) return Y_AXIS_LABEL_BASE_FONT_SIZE;
  const maxLength = labels.reduce((currentMax, label) => Math.max(currentMax, label.length), 1);
  const usableWidth = Math.max(10, labelWidth - 2);
  const estimatedFontSize = usableWidth / (maxLength * 0.58);
  return Math.max(
    Y_AXIS_LABEL_MIN_FONT_SIZE,
    Math.min(Y_AXIS_LABEL_BASE_FONT_SIZE, Number(estimatedFontSize.toFixed(2))),
  );
}

function buildGraphAxisTicks(values: number[], chartHeight: number, segments = 4): GraphAxisTick[] {
  if (values.length === 0 || chartHeight <= 0 || segments <= 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return Array.from({ length: segments + 1 }, (_, index) => {
    const ratio = index / segments;
    const value = span === 0 ? max : max - span * ratio;
    const top = ratio * Math.max(0, chartHeight - 1);
    return { value, top };
  });
}

function resolveFlatGraphRange(points: GraphPoint[]): GraphLineRange | undefined {
  if (points.length === 0) return undefined;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min !== max) return undefined;

  const centerValue = max;
  const offset = Math.max(1, Math.abs(centerValue) * 0.04);
  return { y: { min: centerValue - offset, max: centerValue + offset } };
}

function buildGraphDatasetSignature(points: GraphPoint[]) {
  if (points.length === 0) return 'empty';
  return points.map((point) => `${point.date.getTime()}:${point.value.toFixed(4)}`).join('|');
}

function useDeferredChartVisibility(datasetSignature: string, chartWidth: number) {
  const [isChartReady, setIsChartReady] = useState(false);

  useEffect(() => {
    setIsChartReady(false);
    let readyTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const frameId = requestAnimationFrame(() => {
      readyTimeoutId = setTimeout(() => {
        setIsChartReady(true);
      }, CHART_SKELETON_READY_DELAY_MS);
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (readyTimeoutId) clearTimeout(readyTimeoutId);
    };
  }, [chartWidth, datasetSignature]);

  return { isChartReady };
}

function ScrubRollingNumber({
  value,
  formattedText,
  color,
  resetKey,
  containerClassName,
}: {
  value: number;
  formattedText?: string;
  color: string;
  resetKey: string;
  containerClassName?: string;
}) {
  return (
    <View className={cn('flex-row items-center', containerClassName)}>
      <AnimatedRollingNumber
        key={resetKey}
        value={value}
        formattedText={formattedText}
        textStyle={[INSIGHTS_ROLLING_NUMBER_TEXT_STYLE, { color }]}
        numberStyle={{ color }}
        commaStyle={{ color }}
        dotStyle={{ color }}
        signStyle={{ color }}
        compactNotationStyle={{ color }}
        spinningAnimationConfig={INSIGHTS_ROLLING_NUMBER_SPIN_CONFIG}
      />
    </View>
  );
}

const GraphYAxisGrid = React.memo(function GraphYAxisGrid({
  ticks,
  chartWidth,
  chartHeight,
  labelWidth,
  lineColor,
  formatTick,
}: {
  ticks: GraphAxisTick[];
  chartWidth: number;
  chartHeight: number;
  labelWidth: number;
  lineColor: string;
  formatTick: (value: number) => string;
}) {
  const tickLabels = useMemo(
    () => ticks.map((tick) => formatTick(tick.value)),
    [formatTick, ticks],
  );
  const yAxisLabelFontSize = useMemo(
    () => resolveYAxisLabelFontSize(tickLabels, labelWidth),
    [labelWidth, tickLabels],
  );
  const yAxisLabelLineHeight = Math.round(yAxisLabelFontSize * 1.25);
  const resolvedTicks = useMemo(
    () =>
      ticks.map((tick) => {
        const labelTop = Math.max(
          0,
          Math.min(chartHeight - yAxisLabelLineHeight, tick.top - yAxisLabelLineHeight / 2),
        );
        return {
          labelTop,
          lineTop: labelTop + yAxisLabelLineHeight / 2,
        };
      }),
    [chartHeight, ticks, yAxisLabelLineHeight],
  );
  const gridDotCount = Math.max(2, Math.floor(chartWidth / 8));

  return (
    <>
      <View
        pointerEvents="none"
        style={[styles.absoluteOverlay, buildSizeStyle(chartWidth, chartHeight)]}
      >
        {resolvedTicks.map(({ lineTop }, index) => (
          <View key={`grid-${index}`} style={[styles.graphYAxisRow, { top: lineTop - 1 }]}>
            {Array.from({ length: gridDotCount }, (_, dotIndex) => {
              const left = (dotIndex * Math.max(0, chartWidth - 2)) / Math.max(1, gridDotCount - 1);
              return (
                <View
                  key={`grid-${index}-dot-${dotIndex}`}
                  style={[styles.graphYAxisDot, { left, backgroundColor: lineColor }]}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.absoluteOverlay,
          { left: chartWidth, width: labelWidth, height: chartHeight },
        ]}
      >
        {resolvedTicks.map(({ labelTop }, index) => {
          return (
            <View
              key={`label-${index}`}
              style={[styles.graphYAxisLabelContainer, { top: labelTop }]}
            >
              <Text
                variant="label"
                tone="muted"
                numberOfLines={1}
                style={[
                  styles.graphYAxisLabel,
                  { fontSize: yAxisLabelFontSize, lineHeight: yAxisLabelLineHeight },
                ]}
              >
                {tickLabels[index]}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
});

const ChartLoadingSkeleton = React.memo(function ChartLoadingSkeleton({
  chartWidth,
  chartHeight,
}: {
  chartWidth: number;
  chartHeight: number;
}) {
  const pulseOpacity = useRef(new RNAnimated.Value(0.46)).current;
  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseOpacity, {
          toValue: 0.74,
          duration: 660,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulseOpacity, {
          toValue: 0.46,
          duration: 660,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => {
      pulse.stop();
      pulseOpacity.stopAnimation();
      pulseOpacity.setValue(0.46);
    };
  }, [pulseOpacity]);

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[
        styles.absoluteOverlay,
        buildSizeStyle(chartWidth, chartHeight),
        { opacity: pulseOpacity },
      ]}
    >
      <View
        style={[
          styles.chartSkeletonFill,
          buildSizeStyle(
            Math.max(0, chartWidth - GRAPH_HORIZONTAL_PADDING * 2),
            Math.max(0, chartHeight - GRAPH_VERTICAL_PADDING * 2),
          ),
        ]}
      />
    </RNAnimated.View>
  );
});

const AssetHistoryLineChart = React.memo(function AssetHistoryLineChart({
  monthRows,
  chartWidth,
  primaryColor,
  onSelectMonthKey,
  onGestureStart,
  onGestureEnd,
}: {
  monthRows: AssetHistoryMonthRow[];
  chartWidth: number;
  primaryColor: string;
  onSelectMonthKey: (monthKey: string) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}) {
  const graphPoints = useMemo<GraphPoint[]>(
    () =>
      monthRows.map((row) => ({
        value: row.totalAssets,
        date: monthDateFromMonthKey(row.monthKey),
      })),
    [monthRows],
  );
  const graphRange = useMemo(() => resolveFlatGraphRange(graphPoints), [graphPoints]);
  const graphDatasetSignature = useMemo(
    () => buildGraphDatasetSignature(graphPoints),
    [graphPoints],
  );
  const monthKeyByTime = useMemo(
    () =>
      new Map(
        graphPoints.map((point, index) => [point.date.getTime(), monthRows[index]?.monthKey ?? '']),
      ),
    [graphPoints, monthRows],
  );
  const handlePointSelected = useCallback(
    (point: GraphPoint) => {
      const normalizedMonthKey =
        monthKeyByTime.get(point.date.getTime()) ??
        normalizeMonthKey(monthKeyFromDateLocal(point.date));
      if (!normalizedMonthKey) return;
      onSelectMonthKey(normalizedMonthKey);
    },
    [monthKeyByTime, onSelectMonthKey],
  );
  const { isChartReady } = useDeferredChartVisibility(graphDatasetSignature, chartWidth);

  if (IS_EXPO_GO) {
    return (
      <View
        style={[
          buildSizeStyle(chartWidth, ASSET_HISTORY_CHART_HEIGHT),
          styles.chartRuntimeFallback,
          {
            borderColor: withColorAlpha(primaryColor, 0.18),
            backgroundColor: withColorAlpha(primaryColor, 0.06),
          },
        ]}
      >
        <Text variant="label" tone="muted" className="text-center">
          {I18n.t('insights.charts.expo_go_fallback')}
        </Text>
      </View>
    );
  }

  return (
    <View style={buildSizeStyle(chartWidth, ASSET_HISTORY_CHART_HEIGHT)}>
      {isChartReady ? (
        <>
          <LineGraph
            animated
            points={graphPoints}
            range={graphRange}
            color={primaryColor}
            lineThickness={2.8}
            gradientFillColors={[
              withColorAlpha(primaryColor, 0.2),
              withColorAlpha(primaryColor, 0.03),
            ]}
            enablePanGesture
            panGestureDelay={0}
            horizontalPadding={GRAPH_HORIZONTAL_PADDING}
            verticalPadding={GRAPH_VERTICAL_PADDING}
            enableIndicator={false}
            onPointSelected={handlePointSelected}
            onGestureStart={onGestureStart}
            onGestureEnd={onGestureEnd}
            style={buildSizeStyle(chartWidth, ASSET_HISTORY_CHART_HEIGHT)}
          />
        </>
      ) : (
        <ChartLoadingSkeleton chartWidth={chartWidth} chartHeight={ASSET_HISTORY_CHART_HEIGHT} />
      )}
    </View>
  );
});

// ExpenseTrendLineChart and IncomeTrendLineChart replaced by TrendBarChart

const IncomeRateLineChart = React.memo(function IncomeRateLineChart({
  points,
  rates,
  chartWidth,
  primaryColor,
  onSelectPointIndex,
  onGestureStart,
  onGestureEnd,
}: {
  points: IncomeRatePoint[];
  rates: number[];
  chartWidth: number;
  primaryColor: string;
  onSelectPointIndex: (index: number) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}) {
  const graphPoints = useMemo<GraphPoint[]>(
    () =>
      points.map((point, index) => ({
        value: rates[index] ?? 0,
        date: monthDateFromMonthKey(point.monthKey),
      })),
    [points, rates],
  );
  const graphRange = useMemo(() => resolveFlatGraphRange(graphPoints), [graphPoints]);
  const graphDatasetSignature = useMemo(
    () => buildGraphDatasetSignature(graphPoints),
    [graphPoints],
  );
  const indexByTime = useMemo(
    () => new Map(graphPoints.map((point, index) => [point.date.getTime(), index])),
    [graphPoints],
  );
  const handlePointSelected = useCallback(
    (point: GraphPoint) => {
      const index = indexByTime.get(point.date.getTime());
      if (index === undefined) return;
      onSelectPointIndex(index);
    },
    [indexByTime, onSelectPointIndex],
  );
  const { isChartReady } = useDeferredChartVisibility(graphDatasetSignature, chartWidth);

  if (IS_EXPO_GO) {
    return (
      <View
        style={[
          buildSizeStyle(chartWidth, INCOME_RATE_CHART_HEIGHT),
          styles.chartRuntimeFallback,
          {
            borderColor: withColorAlpha(primaryColor, 0.18),
            backgroundColor: withColorAlpha(primaryColor, 0.06),
          },
        ]}
      >
        <Text variant="label" tone="muted" className="text-center">
          {I18n.t('insights.charts.expo_go_fallback')}
        </Text>
      </View>
    );
  }

  return (
    <View style={buildSizeStyle(chartWidth, INCOME_RATE_CHART_HEIGHT)}>
      {isChartReady ? (
        <>
          <LineGraph
            animated
            points={graphPoints}
            range={graphRange}
            color={primaryColor}
            lineThickness={2.8}
            gradientFillColors={[
              withColorAlpha(primaryColor, 0.2),
              withColorAlpha(primaryColor, 0.03),
            ]}
            enablePanGesture
            panGestureDelay={0}
            horizontalPadding={GRAPH_HORIZONTAL_PADDING}
            verticalPadding={GRAPH_VERTICAL_PADDING}
            enableIndicator={false}
            onPointSelected={handlePointSelected}
            onGestureStart={onGestureStart}
            onGestureEnd={onGestureEnd}
            style={buildSizeStyle(chartWidth, INCOME_RATE_CHART_HEIGHT)}
          />
        </>
      ) : (
        <ChartLoadingSkeleton chartWidth={chartWidth} chartHeight={INCOME_RATE_CHART_HEIGHT} />
      )}
    </View>
  );
});

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className={cn(
        'rounded-full border px-3.5 py-2 flex-row items-center gap-1 active:opacity-85',
        active ? 'border-primary/50 bg-primary/15' : 'border-border/40 bg-card',
      )}
    >
      <Text variant="label" className={cn(active ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

function PeriodPickerPopover({
  visible,
  anchorRect,
  screenWidth,
  screenHeight,
  locale,
  currentPreset,
  currentAnchorDate,
  currentCustomStart,
  currentCustomEnd,
  currentCustomDateField,
  onClose,
  onCommit,
}: {
  visible: boolean;
  anchorRect: PeriodPickerAnchorRect | null;
  screenWidth: number;
  screenHeight: number;
  locale: string;
  currentPreset: PeriodPreset;
  currentAnchorDate: Date;
  currentCustomStart: string;
  currentCustomEnd: string;
  currentCustomDateField: 'start' | 'end';
  onClose: () => void;
  onCommit: (payload: PeriodPickerCommitPayload) => void;
}) {
  const themeColors = useThemeColors();
  const today = useMemo(() => startOfDayDate(new Date()), []);
  const [draftAnchorDate, setDraftAnchorDate] = useState(() => startOfDayDate(currentAnchorDate));
  const [draftCustomStart, setDraftCustomStart] = useState(currentCustomStart);
  const [draftCustomEnd, setDraftCustomEnd] = useState(currentCustomEnd);
  const [draftCustomDateField, setDraftCustomDateField] =
    useState<'start' | 'end'>(currentCustomDateField);
  const [visibleYearPageStart, setVisibleYearPageStart] = useState(() =>
    yearPickerPageStartFromYear(currentAnchorDate.getFullYear()),
  );
  const [visibleMonthYear, setVisibleMonthYear] = useState(currentAnchorDate.getFullYear());
  const [visibleWeekMonth, setVisibleWeekMonth] = useState(() =>
    startOfMonthDate(currentAnchorDate),
  );

  useEffect(() => {
    if (!visible) return;
    const normalizedAnchor = startOfDayDate(currentAnchorDate);
    setDraftAnchorDate(normalizedAnchor);
    setDraftCustomStart(currentCustomStart);
    setDraftCustomEnd(currentCustomEnd);
    setDraftCustomDateField(currentCustomDateField);
    setVisibleYearPageStart(yearPickerPageStartFromYear(normalizedAnchor.getFullYear()));
    setVisibleMonthYear(normalizedAnchor.getFullYear());
    setVisibleWeekMonth(startOfMonthDate(normalizedAnchor));
  }, [
    currentAnchorDate,
    currentCustomDateField,
    currentCustomEnd,
    currentCustomStart,
    currentPreset,
    visible,
  ]);

  const previewRange = useMemo(
    () => getPeriodRange(currentPreset, draftAnchorDate, draftCustomStart, draftCustomEnd),
    [currentPreset, draftAnchorDate, draftCustomEnd, draftCustomStart],
  );
  const previewLabel = useMemo(
    () => periodLabel(currentPreset, previewRange, locale),
    [currentPreset, locale, previewRange],
  );
  const selectedWeekKey = useMemo(
    () =>
      currentPreset === 'week'
        ? `${dayKeyFromIsoLocal(previewRange.start)}|${dayKeyFromIsoLocal(previewRange.end)}`
        : '',
    [currentPreset, previewRange.end, previewRange.start],
  );
  const canApplyCustom = useMemo(
    () => !!buildCustomPeriodState(draftCustomStart, draftCustomEnd),
    [draftCustomEnd, draftCustomStart],
  );
  const weekOptions = useMemo(() => buildWeekPickerOptions(visibleWeekMonth), [visibleWeekMonth]);
  const yearPage = useMemo(
    () => Array.from({ length: MONTHS_PER_YEAR }, (_, index) => visibleYearPageStart + index),
    [visibleYearPageStart],
  );
  const monthOptions = useMemo(() => monthLabelsForYear(visibleMonthYear, locale), [locale, visibleMonthYear]);
  const cardWidth = Math.min(screenWidth - PERIOD_PICKER_SIDE_MARGIN * 2, PERIOD_PICKER_CARD_WIDTH);
  const anchorCenterX = anchorRect ? anchorRect.x + anchorRect.width / 2 : screenWidth / 2;
  const cardLeft = clampNumber(
    anchorCenterX - cardWidth / 2,
    PERIOD_PICKER_SIDE_MARGIN,
    screenWidth - cardWidth - PERIOD_PICKER_SIDE_MARGIN,
  );
  const cardTop = Math.max(
    PERIOD_PICKER_SIDE_MARGIN,
    (anchorRect?.y ?? spacing.xl * 2) + (anchorRect?.height ?? 0) + spacing.xs,
  );
  const maxCardHeight = Math.max(240, screenHeight - cardTop - PERIOD_PICKER_SIDE_MARGIN);

  const commitSelection = useCallback(
    (payload: PeriodPickerCommitPayload) => {
      void triggerHaptic('selection');
      onCommit(payload);
    },
    [onCommit],
  );

  const handleCustomDateSelect = useCallback(
    (field: 'start' | 'end', value: string) => {
      if (field === 'start') {
        setDraftCustomStart(value);
        const nextStart = parseDateInput(value);
        const currentEnd = parseDateInput(draftCustomEnd);
        if (nextStart && currentEnd && nextStart > currentEnd) {
          setDraftCustomEnd(value);
        }
        return;
      }

      setDraftCustomEnd(value);
      const currentStart = parseDateInput(draftCustomStart);
      const nextEnd = parseDateInput(value);
      if (currentStart && nextEnd && nextEnd < currentStart) {
        setDraftCustomStart(value);
      }
    },
    [draftCustomEnd, draftCustomStart],
  );

  const applyCustomSelection = useCallback(() => {
    const nextState = buildCustomPeriodState(draftCustomStart, draftCustomEnd);
    if (!nextState) return;
    commitSelection({
      preset: 'custom',
      anchorDate: nextState.anchorDate,
      customStart: draftCustomStart,
      customEnd: draftCustomEnd,
      activeCustomDateField: draftCustomDateField,
    });
  }, [commitSelection, draftCustomDateField, draftCustomEnd, draftCustomStart]);

  if (!visible) return null;

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1" pointerEvents="box-none">
        <Pressable
          className="absolute inset-0 bg-black/15"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.close')}
        />

        <View
          className="rounded-[28px] bg-background overflow-hidden"
          style={[
            styles.periodPickerCard,
            {
              left: cardLeft,
              top: cardTop,
              width: cardWidth,
              maxHeight: maxCardHeight,
              borderColor: withColorAlpha(themeColors.border, 0.45),
              shadowColor: themeColors.text,
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-4 p-4">
              <View className="min-h-9 items-center justify-center">
                <View className="flex-row items-center justify-center gap-2">
                  <CalendarDays size={18} color={themeColors.text} />
                  <Text variant="subheading" className="text-foreground">
                    {previewLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.close')}
                  className="absolute right-0 top-0 h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                >
                  <X size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>

              {currentPreset === 'year' ? (
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      onPress={() => setVisibleYearPageStart((previous) => previous - MONTHS_PER_YEAR)}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.previous')}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                    >
                      <ChevronLeft size={16} color={themeColors.textMuted} />
                    </Pressable>
                    <View className="rounded-full border border-border/35 bg-secondary/45 px-3 py-1.5">
                      <Text variant="label" className="text-foreground">
                        {visibleYearPageStart} - {visibleYearPageStart + MONTHS_PER_YEAR - 1}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setVisibleYearPageStart((previous) => previous + MONTHS_PER_YEAR)}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.next')}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                    >
                      <ChevronRight size={16} color={themeColors.textMuted} />
                    </Pressable>
                  </View>
                  <View className="flex-row flex-wrap justify-between gap-y-2">
                    {yearPage.map((year) => {
                      const isSelected = draftAnchorDate.getFullYear() === year;
                      return (
                        <Pressable
                          key={year}
                          onPress={() =>
                            commitSelection({
                              preset: 'year',
                              anchorDate: new Date(year, 0, 1),
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={String(year)}
                          accessibilityState={{ selected: isSelected }}
                          style={styles.periodPickerGridItem}
                          className={cn(
                            'rounded-2xl border px-3 py-3 items-center',
                            isSelected
                              ? 'border-primary/50 bg-primary/12'
                              : 'border-border/40 bg-card',
                          )}
                        >
                          <Text
                            variant="caption"
                            className={cn(isSelected ? 'text-primary' : 'text-foreground')}
                          >
                            {year}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {currentPreset === 'month' ? (
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      onPress={() => setVisibleMonthYear((previous) => previous - 1)}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.previous')}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                    >
                      <ChevronLeft size={16} color={themeColors.textMuted} />
                    </Pressable>
                    <View className="rounded-full border border-border/35 bg-secondary/45 px-3 py-1.5">
                      <Text variant="label" className="text-foreground">
                        {visibleMonthYear}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setVisibleMonthYear((previous) => previous + 1)}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.next')}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                    >
                      <ChevronRight size={16} color={themeColors.textMuted} />
                    </Pressable>
                  </View>
                  <View className="flex-row flex-wrap justify-between gap-y-2">
                    {monthOptions.map((label, monthIndex) => {
                      const isSelected =
                        draftAnchorDate.getFullYear() === visibleMonthYear &&
                        draftAnchorDate.getMonth() === monthIndex;
                      return (
                        <Pressable
                          key={`${visibleMonthYear}-${monthIndex}`}
                          onPress={() =>
                            commitSelection({
                              preset: 'month',
                              anchorDate: new Date(visibleMonthYear, monthIndex, 1),
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          accessibilityState={{ selected: isSelected }}
                          style={styles.periodPickerGridItem}
                          className={cn(
                            'rounded-2xl border px-3 py-3 items-center',
                            isSelected
                              ? 'border-primary/50 bg-primary/12'
                              : 'border-border/40 bg-card',
                          )}
                        >
                          <Text
                            variant="caption"
                            className={cn(isSelected ? 'text-primary' : 'text-foreground')}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {currentPreset === 'week' ? (
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      onPress={() =>
                        setVisibleWeekMonth(
                          (previous) =>
                            new Date(previous.getFullYear(), previous.getMonth() - 1, 1),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.previous')}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                    >
                      <ChevronLeft size={16} color={themeColors.textMuted} />
                    </Pressable>
                    <View className="rounded-full border border-border/35 bg-secondary/45 px-3 py-1.5">
                      <Text variant="label" className="text-foreground">
                        {monthLabelFromMonthKey(monthKeyFromDateLocal(visibleWeekMonth), locale)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setVisibleWeekMonth(
                          (previous) =>
                            new Date(previous.getFullYear(), previous.getMonth() + 1, 1),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.next')}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                    >
                      <ChevronRight size={16} color={themeColors.textMuted} />
                    </Pressable>
                  </View>
                  <View className="gap-2">
                    {weekOptions.map((option) => {
                      const isSelected = option.key === selectedWeekKey;
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() =>
                            commitSelection({
                              preset: 'week',
                              anchorDate: option.anchorDate,
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={periodLabel('week', option.range, locale)}
                          accessibilityState={{ selected: isSelected }}
                          className={cn(
                            'rounded-[22px] border px-3.5 py-3',
                            isSelected
                              ? 'border-primary/50 bg-primary/12'
                              : 'border-border/40 bg-card',
                          )}
                        >
                          <Text
                            variant="caption"
                            className={cn(
                              'text-foreground',
                              isSelected ? 'text-primary' : undefined,
                            )}
                          >
                            {periodLabel('week', option.range, locale)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {currentPreset === 'custom' ? (
                <View className="gap-3">
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setDraftCustomDateField('start');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('insights.filters.start')}
                      accessibilityState={{ selected: draftCustomDateField === 'start' }}
                      className={cn(
                        'flex-1 rounded-2xl border px-3 py-2.5',
                        draftCustomDateField === 'start'
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border/30 bg-card',
                      )}
                    >
                      <Text variant="label" tone="muted">
                        {I18n.t('insights.filters.start')}
                      </Text>
                      <Text variant="caption" className="mt-0.5">
                        {draftCustomStart}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setDraftCustomDateField('end');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('insights.filters.end')}
                      accessibilityState={{ selected: draftCustomDateField === 'end' }}
                      className={cn(
                        'flex-1 rounded-2xl border px-3 py-2.5',
                        draftCustomDateField === 'end'
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border/30 bg-card',
                      )}
                    >
                      <Text variant="label" tone="muted">
                        {I18n.t('insights.filters.end')}
                      </Text>
                      <Text variant="caption" className="mt-0.5">
                        {draftCustomEnd}
                      </Text>
                    </Pressable>
                  </View>
                  <View className="overflow-hidden rounded-[22px] border border-border/30 bg-card/35">
                    <DatePanel
                      value={draftCustomDateField === 'start' ? draftCustomStart : draftCustomEnd}
                      onSelect={(value) => handleCustomDateSelect(draftCustomDateField, value)}
                      showQuickDates={false}
                    />
                  </View>
                  <Pressable
                    onPress={applyCustomSelection}
                    disabled={!canApplyCustom}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('insights.period_picker.apply_custom')}
                    className={cn(
                      'rounded-2xl px-3.5 py-3 items-center',
                      canApplyCustom ? 'bg-primary active:opacity-90' : 'bg-secondary/70',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={cn(canApplyCustom ? 'text-primary-foreground' : 'text-muted-foreground')}
                    >
                      {I18n.t('insights.period_picker.apply_custom')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </ThemeModal>
  );
}

const InsightsWindowPage = React.memo(
  function InsightsWindowPage({
    item,
    pageData,
    pageStyle,
    isChartScrubbing,
    paneRenderVersion: _paneRenderVersion,
    getPageScrollRef,
    renderInsightsPane,
  }: {
    item: number;
    pageData: InsightPageData;
    pageStyle: { width: number };
    isChartScrubbing: boolean;
    paneRenderVersion: string;
    getPageScrollRef: (index: number) => { current: ScrollView | null };
    renderInsightsPane: (pageData: InsightPageData) => React.ReactNode;
  }) {
    return (
      <View style={pageStyle} className="flex-1 bg-background">
        <ScrollView
          ref={(ref) => {
            getPageScrollRef(item).current = ref;
          }}
          className="flex-1"
          scrollEnabled={!isChartScrubbing}
          contentContainerStyle={INSIGHTS_SCROLL_CONTENT_STYLE}
        >
          <TabletContentContainer>{renderInsightsPane(pageData)}</TabletContentContainer>
        </ScrollView>
      </View>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.pageData === next.pageData &&
    prev.pageStyle === next.pageStyle &&
    prev.isChartScrubbing === next.isChartScrubbing &&
    prev.paneRenderVersion === next.paneRenderVersion &&
    prev.getPageScrollRef === next.getPageScrollRef &&
    prev.renderInsightsPane === next.renderInsightsPane,
);

interface InsightsScreenProps {
  resetToCurrentMonthToken?: number;
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  activityBreakdownInsightRequest?: {
    insightType: NavigableInsightType;
    anchorDateKey?: string;
    customEnd?: string;
    customStart?: string;
    monthKey: string;
    periodPreset?: PeriodPreset;
    token: number;
  } | null;
  isSimpleMode?: boolean;
  onTutorialTargetLayout?: (targetId: 'insights.type_selector', rect: TutorialTargetRect) => void;
  tutorialSpotlightRequest?: TutorialSpotlightRequest;
}

export function InsightsScreen({
  resetToCurrentMonthToken = 0,
  onOpenDrilldown,
  onOpenTransaction,
  activityBreakdownInsightRequest = null,
  isSimpleMode = false,
  onTutorialTargetLayout,
  tutorialSpotlightRequest,
}: InsightsScreenProps) {
  const {
    isLoading,
    settings,
    categories,
    accounts,
    accountGroups,
    transactions: rawTransactions,
    canUseTimeDisplayMode,
    getTrueHourlyRateForDate,
    getDisplayValueForTransaction,
    insightsPreferencesJson,
    updateInsightsPreferencesJson,
    simpleWalletId,
    monthlyWages,
  } = useApp();

  const allTransactions = useMemo(() => {
    if (!isSimpleMode) return rawTransactions;
    return filterTransactionsByWallet(rawTransactions, simpleWalletId);
  }, [rawTransactions, isSimpleMode, simpleWalletId]);
  const { transactionDayKeyById, transactionMonthKeyById } = useMemo(() => {
    const dayKeyById = new Map<string, string>();
    const monthKeyById = new Map<string, string>();

    allTransactions.forEach((transaction) => {
      dayKeyById.set(transaction.id, dayKeyFromIsoLocal(transaction.date));
      monthKeyById.set(transaction.id, monthKeyFromIsoLocal(transaction.date));
    });

    return {
      transactionDayKeyById: dayKeyById,
      transactionMonthKeyById: monthKeyById,
    };
  }, [allTransactions]);
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const [periodPresetByInsight, setPeriodPresetByInsight] = useState<
    Partial<Record<InsightType, PeriodPreset>>
  >({});
  const [activityRequestPeriodPreset, setActivityRequestPeriodPreset] = useState<{
    insightType: InsightType;
    preset: PeriodPreset;
  } | null>(null);
  const [anchorDate, setAnchorDate] = useState(() => startOfMonthDate(new Date()));
  const [customStart, setCustomStart] = useState(() =>
    formatDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [customEnd, setCustomEnd] = useState(() => formatDateInput(new Date()));
  const [activeCustomDateField, setActiveCustomDateField] = useState<'start' | 'end'>('start');
  const [selectedInsightType, setSelectedInsightType] = useState<InsightType>('expense_breakdown');
  const persistedPeriodPreset =
    periodPresetByInsight[selectedInsightType] ?? getDefaultPeriodPreset(selectedInsightType);
  const periodPreset =
    activityRequestPeriodPreset?.insightType === selectedInsightType
      ? activityRequestPeriodPreset.preset
      : persistedPeriodPreset;
  const setPeriodPreset = useCallback(
    (preset: PeriodPreset) => {
      setActivityRequestPeriodPreset((prev) =>
        prev?.insightType === selectedInsightType ? null : prev,
      );
      setPeriodPresetByInsight((prev) => ({ ...prev, [selectedInsightType]: preset }));
    },
    [selectedInsightType],
  );
  const [activeBreakdownSliceId, setActiveBreakdownSliceId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [excludedExpenseTrendAccountIds, setExcludedExpenseTrendAccountIds] = useState<string[]>(
    [],
  );
  const [excludedExpenseTrendExpenseCategoryIds, setExcludedExpenseTrendExpenseCategoryIds] =
    useState<string[]>([]);
  const [excludedIncomeTrendAccountIds, setExcludedIncomeTrendAccountIds] = useState<string[]>([]);
  const [excludedIncomeTrendIncomeCategoryIds, setExcludedIncomeTrendIncomeCategoryIds] = useState<
    string[]
  >([]);
  const [excludedSavingsIncomeCategoryIds, setExcludedSavingsIncomeCategoryIds] = useState<
    string[]
  >([]);
  const [excludedSavingsExpenseCategoryIds, setExcludedSavingsExpenseCategoryIds] = useState<
    string[]
  >([]);
  const [excludedTimeCostExpenseCategoryId, setExcludedTimeCostExpenseCategoryId] = useState<
    string | null
  >(null);
  const [excludedAssetHistoryAccountIds, setExcludedAssetHistoryAccountIds] = useState<string[]>(
    () => accounts.filter((account) => !account.includeInTotals).map((account) => account.id),
  );
  const [expenseTrendScrubMonthByYear, setExpenseTrendScrubMonthByYear] = useState<
    Record<string, string>
  >({});
  const [incomeTrendScrubMonthByYear, setIncomeTrendScrubMonthByYear] = useState<
    Record<string, string>
  >({});
  const [assetHistoryScrubMonthByYear, setAssetHistoryScrubMonthByYear] = useState<
    Record<string, string>
  >({});
  const [selectedIncomeRatePointIndex, setSelectedIncomeRatePointIndex] = useState<number | null>(
    null,
  );
  const [incomeRateDisplayUnit, setIncomeRateDisplayUnit] =
    useState<IncomeRateDisplayUnit>('hourly');
  const [isIncomeRateUnitPickerOpen, setIsIncomeRateUnitPickerOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);
  const [periodPickerAnchorRect, setPeriodPickerAnchorRect] =
    useState<PeriodPickerAnchorRect | null>(null);
  const [isChartScrubbing, setIsChartScrubbing] = useState(false);
  const [selectedCalendarDayKey, setSelectedCalendarDayKey] = useState<string | null>(null);
  const [timeCostViewMode, setTimeCostViewMode] = useState<TimeCostViewMode>('category');
  const calendarDetailAnimRef = useRef(new RNAnimated.Value(1));
  const insightsTypeSelectorRef = useRef<View | null>(null);
  const periodPickerTriggerRef = useRef<View | null>(null);
  const selectedIncomeRatePointIndexRef = useRef<number | null>(selectedIncomeRatePointIndex);
  const expenseTrendScrubMonthByYearRef = useRef<Record<string, string>>(
    expenseTrendScrubMonthByYear,
  );
  const incomeTrendScrubMonthByYearRef = useRef<Record<string, string>>(
    incomeTrendScrubMonthByYear,
  );
  const assetHistoryScrubMonthByYearRef = useRef<Record<string, string>>(
    assetHistoryScrubMonthByYear,
  );
  const lastScrubHapticAtRef = useRef(0);

  const { width, height } = useWindowDimensions();
  const { isTablet } = useDeviceLayout();
  const pageWidth = Math.max(1, width);
  const insightsPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  const effectiveChartBasis = isTablet ? Math.min(width, TABLET_CONTENT_MAX_WIDTH) : width;
  const chartWidth = Math.max(260, effectiveChartBasis - 76);
  const lineChartWidth = Math.max(260, effectiveChartBasis - INSIGHTS_LINE_CHART_SIDE_INSET * 2);
  const lineChartSectionStyle = useMemo(
    () => ({ marginHorizontal: -INSIGHTS_LINE_CHART_SECTION_BLEED }),
    [],
  );
  const pieSize = Math.min(240, chartWidth);
  const visibleInsightTypes = isSimpleMode
    ? INSIGHT_TYPES.filter((t) => t !== 'asset_history')
    : INSIGHT_TYPES;
  const triggerScrubHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastScrubHapticAtRef.current < 72) return;
    lastScrubHapticAtRef.current = now;
    void triggerHaptic('selection');
  }, []);
  const incomeRateUnitOptions = useMemo(
    () =>
      [
        {
          value: 'hourly' as const,
          label: I18n.t('wage.type.hourly'),
        },
        {
          value: 'monthly' as const,
          label: I18n.t('wage.type.monthly'),
        },
        {
          value: 'yearly' as const,
          label: I18n.t('wage.type.yearly'),
        },
      ] satisfies { value: IncomeRateDisplayUnit; label: string }[],
    [],
  );

  const insightTypeOptions = useMemo(
    () =>
      visibleInsightTypes.map((type) => ({
        value: type,
        label: String(I18n.t(`insights.short_labels.${type}`)),
        description: String(I18n.t(`insights.${type}_description`)),
        icon: renderInsightTypeIcon(type),
      })),
    [visibleInsightTypes],
  );
  const insightTypeOptionGroups = useMemo(() => {
    const visibleInsightTypeSet = new Set(visibleInsightTypes);
    return INSIGHT_TYPE_GROUPS.map((group) => {
      const optionValues = group.insightTypes.filter((type) => visibleInsightTypeSet.has(type));
      if (!optionValues.length) return null;
      return {
        id: group.id,
        label: String(I18n.t(`insights.groups.${group.id}.title`)),
        optionValues,
        defaultExpanded: optionValues.includes(selectedInsightType),
      };
    }).filter((group): group is NonNullable<typeof group> => !!group);
  }, [selectedInsightType, visibleInsightTypes]);
  const calendarWeekdayLabels = useMemo(
    () => getCalendarWeekdayLabels(activeLocale),
    [activeLocale],
  );

  useEffect(() => {
    if (isSimpleMode && selectedInsightType === 'asset_history') {
      setSelectedInsightType('expense_breakdown');
    }
  }, [isSimpleMode, selectedInsightType]);
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const isChartScrubLockedRef = useRef(false);
  const selectedInsightTypeRef = useRef<InsightType>(selectedInsightType);
  const periodPresetByInsightRef = useRef(periodPresetByInsight);
  const [handledActivityBreakdownRequestToken, setHandledActivityBreakdownRequestToken] =
    useState(0);
  const committedPageIndexRef = useRef(INSIGHTS_PAGER_CENTER_INDEX);
  const [headerPreviewPageIndex, setHeaderPreviewPageIndex] = useState(INSIGHTS_PAGER_CENTER_INDEX);
  const headerPreviewPageIndexRef = useRef(INSIGHTS_PAGER_CENTER_INDEX);
  const activeBreakdownSliceIdRef = useRef<string | null>(null);
  const pieTouchStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pageScrollRefs = useRef(new Map<number, { current: ScrollView | null }>());
  const pageDataCacheRef = useRef(new Map<string, InsightPageData>());
  const hasHydratedAssetHistoryExclusionsRef = useRef(false);
  const getPageScrollRef = useCallback((index: number) => {
    const existing = pageScrollRefs.current.get(index);
    if (existing) return existing;
    const next: { current: ScrollView | null } = { current: null };
    pageScrollRefs.current.set(index, next);
    return next;
  }, []);
  const setPagerScrollEnabled = useCallback((enabled: boolean) => {
    const listRef = horizontalListRef.current as unknown as {
      setNativeProps?: (props: { scrollEnabled?: boolean }) => void;
    } | null;
    listRef?.setNativeProps?.({ scrollEnabled: enabled });
  }, []);
  const lockChartScrub = useCallback(() => {
    if (isChartScrubLockedRef.current) return;
    isChartScrubLockedRef.current = true;
    setIsChartScrubbing(true);
    setPagerScrollEnabled(false);
  }, [setPagerScrollEnabled]);
  const unlockChartScrub = useCallback(() => {
    if (!isChartScrubLockedRef.current) return;
    isChartScrubLockedRef.current = false;
    setIsChartScrubbing(false);
    setPagerScrollEnabled(true);
  }, [setPagerScrollEnabled]);

  useEffect(() => {
    selectedInsightTypeRef.current = selectedInsightType;
  }, [selectedInsightType]);

  useEffect(() => {
    periodPresetByInsightRef.current = periodPresetByInsight;
  }, [periodPresetByInsight]);

  const pendingActivityBreakdownTarget = useMemo(() => {
    if (!activityBreakdownInsightRequest) return null;
    if (activityBreakdownInsightRequest.token <= handledActivityBreakdownRequestToken) {
      return null;
    }

    return {
      insightType: activityBreakdownInsightRequest.insightType,
      periodState: resolveActivityInsightPeriodState(activityBreakdownInsightRequest),
      periodPreset: activityBreakdownInsightRequest.periodPreset,
    };
  }, [activityBreakdownInsightRequest, handledActivityBreakdownRequestToken]);

  useEffect(() => {
    if (!activityBreakdownInsightRequest) return;
    if (activityBreakdownInsightRequest.token <= handledActivityBreakdownRequestToken) {
      return;
    }

    setHandledActivityBreakdownRequestToken(activityBreakdownInsightRequest.token);
    const nextPeriodState = resolveActivityInsightPeriodState(activityBreakdownInsightRequest);

    const targetInsightType = activityBreakdownInsightRequest.insightType;
    const targetFixedPreset = getInsightFilterConfig(targetInsightType).fixedPeriodPreset;
    const targetPreset =
      activityBreakdownInsightRequest.periodPreset ?? targetFixedPreset ?? 'month';
    setActivityRequestPeriodPreset({
      insightType: targetInsightType,
      preset: targetPreset,
    });
    setAnchorDate(nextPeriodState.anchorDate);
    setCustomStart(nextPeriodState.customStart);
    setCustomEnd(nextPeriodState.customEnd);
    setActiveCustomDateField('start');
    activeBreakdownSliceIdRef.current = null;
    setActiveBreakdownSliceId(null);
    setSelectedCalendarDayKey(null);
    setSelectedIncomeRatePointIndex(null);
    setIsFilterModalOpen(false);
    setSelectedInsightType(targetInsightType);
    committedPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    headerPreviewPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    setHeaderPreviewPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
    pageScrollRefs.current.forEach((ref) => ref.current?.scrollTo({ y: 0, animated: false }));
    const frame = requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: INSIGHTS_PAGER_CENTER_INDEX,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activityBreakdownInsightRequest, handledActivityBreakdownRequestToken]);

  useEffect(() => {
    if (resetToCurrentMonthToken <= 0) return;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const currentInsightType = selectedInsightTypeRef.current;
    const currentPeriodPreset =
      periodPresetByInsightRef.current[currentInsightType] ??
      getDefaultPeriodPreset(currentInsightType);
    const nextPeriodPreset =
      getInsightFilterConfig(currentInsightType).fixedPeriodPreset ?? currentPeriodPreset;

    if (nextPeriodPreset === 'custom') {
      setCustomStart(formatDateInput(monthStart));
      setCustomEnd(formatDateInput(monthEnd));
      setActiveCustomDateField('start');
    } else if (nextPeriodPreset === 'week') {
      setAnchorDate(startOfDayDate(now));
    } else {
      setAnchorDate(startOfMonthDate(now));
    }
    setActiveBreakdownSliceId(null);
    setExpenseTrendScrubMonthByYear({});
    setIncomeTrendScrubMonthByYear({});
    setAssetHistoryScrubMonthByYear({});
    setSelectedCalendarDayKey(null);
    setSelectedIncomeRatePointIndex(null);
    setIsFilterModalOpen(false);
    committedPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    headerPreviewPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    setHeaderPreviewPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
    pageScrollRefs.current.forEach((ref) => ref.current?.scrollTo({ y: 0, animated: false }));
    const frame = requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: INSIGHTS_PAGER_CENTER_INDEX,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [resetToCurrentMonthToken]);

  const applyInsightsPreferencesSnapshot = useCallback(
    (saved: Partial<InsightsPreferencesSnapshot>) => {
      if (saved.periodPresetByInsight) {
        setPeriodPresetByInsight((prev) => ({ ...prev, ...saved.periodPresetByInsight }));
      } else if (saved.periodPreset && saved.selectedInsightType) {
        setPeriodPresetByInsight((prev) => ({
          ...prev,
          [saved.selectedInsightType!]: saved.periodPreset,
        }));
      }
      if (saved.selectedInsightType) setSelectedInsightType(saved.selectedInsightType);
      if (saved.activeCustomDateField) setActiveCustomDateField(saved.activeCustomDateField);
      if (saved.timeCostViewMode) setTimeCostViewMode(saved.timeCostViewMode);
      if (saved.selectedAccountIds) setSelectedAccountIds(saved.selectedAccountIds);
      if (saved.excludedExpenseTrendAccountIds) {
        setExcludedExpenseTrendAccountIds(saved.excludedExpenseTrendAccountIds);
      }
      if (saved.excludedExpenseTrendExpenseCategoryIds) {
        setExcludedExpenseTrendExpenseCategoryIds(saved.excludedExpenseTrendExpenseCategoryIds);
      }
      if (saved.excludedIncomeTrendAccountIds) {
        setExcludedIncomeTrendAccountIds(saved.excludedIncomeTrendAccountIds);
      }
      if (saved.excludedIncomeTrendIncomeCategoryIds) {
        setExcludedIncomeTrendIncomeCategoryIds(saved.excludedIncomeTrendIncomeCategoryIds);
      }
      if (saved.excludedSavingsIncomeCategoryIds) {
        setExcludedSavingsIncomeCategoryIds(saved.excludedSavingsIncomeCategoryIds);
      }
      if (saved.excludedSavingsExpenseCategoryIds) {
        setExcludedSavingsExpenseCategoryIds(saved.excludedSavingsExpenseCategoryIds);
      }
      if (saved.excludedAssetHistoryAccountIds) {
        hasHydratedAssetHistoryExclusionsRef.current = true;
        setExcludedAssetHistoryAccountIds(saved.excludedAssetHistoryAccountIds);
      }
      if (saved.excludedTimeCostExpenseCategoryId) {
        setExcludedTimeCostExpenseCategoryId(saved.excludedTimeCostExpenseCategoryId);
      }
      if (saved.anchorDate) {
        const parsedAnchorDate = parseDateInput(saved.anchorDate);
        if (parsedAnchorDate) {
          const restoredPeriodPreset = getHydratedInsightPeriodPreset(saved);
          setAnchorDate(
            restoredPeriodPreset === 'week' || restoredPeriodPreset === 'custom'
              ? startOfDayDate(parsedAnchorDate)
              : startOfMonthDate(parsedAnchorDate),
          );
        }
      }
      if (saved.customStart) setCustomStart(saved.customStart);
      if (saved.customEnd) setCustomEnd(saved.customEnd);
    },
    [],
  );

  const insightsPreferencesSnapshot = useMemo<InsightsPreferencesSnapshot>(
    () => ({
      version: INSIGHTS_PREFERENCES_VERSION,
      selectedInsightType,
      periodPreset: persistedPeriodPreset,
      periodPresetByInsight,
      anchorDate: formatDateInput(anchorDate),
      customStart,
      customEnd,
      activeCustomDateField,
      selectedAccountIds,
      excludedExpenseTrendAccountIds,
      excludedExpenseTrendExpenseCategoryIds,
      excludedIncomeTrendAccountIds,
      excludedIncomeTrendIncomeCategoryIds,
      excludedSavingsIncomeCategoryIds,
      excludedSavingsExpenseCategoryIds,
      excludedTimeCostExpenseCategoryId,
      excludedAssetHistoryAccountIds,
      timeCostViewMode,
    }),
    [
      activeCustomDateField,
      anchorDate,
      customEnd,
      customStart,
      excludedExpenseTrendAccountIds,
      excludedExpenseTrendExpenseCategoryIds,
      excludedIncomeTrendAccountIds,
      excludedIncomeTrendIncomeCategoryIds,
      excludedAssetHistoryAccountIds,
      excludedSavingsExpenseCategoryIds,
      excludedSavingsIncomeCategoryIds,
      excludedTimeCostExpenseCategoryId,
      persistedPeriodPreset,
      periodPresetByInsight,
      selectedAccountIds,
      selectedInsightType,
      timeCostViewMode,
    ],
  );
  usePersistedJsonSnapshot<InsightsPreferencesSnapshot, Partial<InsightsPreferencesSnapshot>>({
    isLoading,
    storedJson: insightsPreferencesJson,
    snapshot: insightsPreferencesSnapshot,
    parseStoredJson: parseInsightsPreferencesPayload,
    applyParsedSnapshot: applyInsightsPreferencesSnapshot,
    writeStoredJson: updateInsightsPreferencesJson,
  });
  const defaultHiddenAssetHistoryAccountIds = useMemo(
    () => accounts.filter((account) => !account.includeInTotals).map((account) => account.id),
    [accounts],
  );
  useEffect(() => {
    if (isLoading || hasHydratedAssetHistoryExclusionsRef.current) return;
    setExcludedAssetHistoryAccountIds(defaultHiddenAssetHistoryAccountIds);
    hasHydratedAssetHistoryExclusionsRef.current = true;
  }, [defaultHiddenAssetHistoryAccountIds, isLoading]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const activeInsightFilterConfig = useMemo(
    () => getInsightFilterConfig(selectedInsightType),
    [selectedInsightType],
  );
  const effectivePeriodPreset = activeInsightFilterConfig.fixedPeriodPreset ?? periodPreset;
  const effectiveSelectedAccountIds = useMemo(
    () => (activeInsightFilterConfig.allowAccountFilter ? selectedAccountIds : []),
    [activeInsightFilterConfig.allowAccountFilter, selectedAccountIds],
  );
  const effectiveSelectedAccountIdSet = useMemo(
    () => new Set(effectiveSelectedAccountIds),
    [effectiveSelectedAccountIds],
  );
  const accountScopedNonTransferEntries = useMemo(() => {
    const hasAccountScope = effectiveSelectedAccountIdSet.size > 0;
    const scopedEntries: { transaction: TransactionWithRelations; timestamp: number }[] = [];

    allTransactions.forEach((transaction) => {
      if (transaction.type === 'transfer') return;
      if (
        hasAccountScope &&
        (!transaction.accountId || !effectiveSelectedAccountIdSet.has(transaction.accountId))
      ) {
        return;
      }
      scopedEntries.push({
        transaction,
        timestamp: Date.parse(transaction.date),
      });
    });

    return scopedEntries;
  }, [allTransactions, effectiveSelectedAccountIdSet]);
  const excludedSavingsIncomeCategorySet = useMemo(
    () => new Set(excludedSavingsIncomeCategoryIds),
    [excludedSavingsIncomeCategoryIds],
  );
  const excludedExpenseTrendAccountSet = useMemo(
    () => new Set(excludedExpenseTrendAccountIds),
    [excludedExpenseTrendAccountIds],
  );
  const excludedExpenseTrendExpenseCategorySet = useMemo(
    () => new Set(excludedExpenseTrendExpenseCategoryIds),
    [excludedExpenseTrendExpenseCategoryIds],
  );
  const excludedIncomeTrendAccountSet = useMemo(
    () => new Set(excludedIncomeTrendAccountIds),
    [excludedIncomeTrendAccountIds],
  );
  const excludedIncomeTrendIncomeCategorySet = useMemo(
    () => new Set(excludedIncomeTrendIncomeCategoryIds),
    [excludedIncomeTrendIncomeCategoryIds],
  );
  const excludedSavingsExpenseCategorySet = useMemo(
    () => new Set(excludedSavingsExpenseCategoryIds),
    [excludedSavingsExpenseCategoryIds],
  );
  const excludedAssetHistoryAccountSet = useMemo(
    () => new Set(excludedAssetHistoryAccountIds),
    [excludedAssetHistoryAccountIds],
  );
  const excludedTimeCostExpenseCategorySet = useMemo(
    () =>
      excludedTimeCostExpenseCategoryId
        ? new Set([excludedTimeCostExpenseCategoryId])
        : new Set<string>(),
    [excludedTimeCostExpenseCategoryId],
  );
  const assetHistoryAccountOptions = accounts;
  const { includedAssetHistoryAccounts, includedAssetHistoryAccountById } = useMemo(() => {
    const includedAccounts: Account[] = [];
    const includedAccountIds: string[] = [];
    const includedAccountById = new Map<string, Account>();

    assetHistoryAccountOptions.forEach((account) => {
      if (excludedAssetHistoryAccountSet.has(account.id)) return;
      includedAccounts.push(account);
      includedAccountIds.push(account.id);
      includedAccountById.set(account.id, account);
    });

    return {
      includedAssetHistoryAccounts: includedAccounts,
      includedAssetHistoryAccountIds: includedAccountIds,
      includedAssetHistoryAccountById: includedAccountById,
    };
  }, [assetHistoryAccountOptions, excludedAssetHistoryAccountSet]);
  const assetHistoryMonthlyDeltas = useMemo(() => {
    if (selectedInsightType !== 'asset_history') return EMPTY_ASSET_HISTORY_MONTHLY_DELTAS;
    if (includedAssetHistoryAccountById.size === 0) return new Map<string, Map<string, number>>();

    const monthlyDeltas = new Map<string, Map<string, number>>();
    const addAccountDelta = (monthKey: string, accountId: string, delta: number) => {
      if (!delta) return;
      let monthDelta = monthlyDeltas.get(monthKey);
      if (!monthDelta) {
        monthDelta = new Map<string, number>();
        monthlyDeltas.set(monthKey, monthDelta);
      }
      monthDelta.set(accountId, (monthDelta.get(accountId) ?? 0) + delta);
    };

    allTransactions.forEach((transaction) => {
      const monthKey =
        transactionMonthKeyById.get(transaction.id) ?? monthKeyFromIsoLocal(transaction.date);
      const isLegacyAdjustmentTransfer = isLegacyBalanceAdjustmentTransfer(transaction);

      if (transaction.type === 'income' && transaction.accountId) {
        const account = includedAssetHistoryAccountById.get(transaction.accountId);
        if (account) {
          addAccountDelta(
            monthKey,
            account.id,
            account.type === 'credit' ? -transaction.amount : transaction.amount,
          );
        }
      }

      if (transaction.type === 'expense' && transaction.accountId) {
        const account = includedAssetHistoryAccountById.get(transaction.accountId);
        if (account) {
          addAccountDelta(
            monthKey,
            account.id,
            account.type === 'credit' ? transaction.amount : -transaction.amount,
          );
        }
      }

      if (
        transaction.type === 'transfer' &&
        !isLegacyAdjustmentTransfer &&
        transaction.toAccountId
      ) {
        const account = includedAssetHistoryAccountById.get(transaction.toAccountId);
        if (account) {
          addAccountDelta(
            monthKey,
            account.id,
            account.type === 'credit' ? -transaction.amount : transaction.amount,
          );
        }
      }

      if (
        transaction.type === 'transfer' &&
        !isLegacyAdjustmentTransfer &&
        transaction.fromAccountId
      ) {
        const account = includedAssetHistoryAccountById.get(transaction.fromAccountId);
        if (account) {
          addAccountDelta(
            monthKey,
            account.id,
            account.type === 'credit' ? transaction.amount : -transaction.amount,
          );
        }
      }

      if (
        (transaction.type === 'balance_adjustment' || isLegacyAdjustmentTransfer) &&
        transaction.accountId
      ) {
        const account = includedAssetHistoryAccountById.get(transaction.accountId);
        if (account) {
          addAccountDelta(monthKey, account.id, transaction.amount);
        }
      }
    });

    return monthlyDeltas;
  }, [
    allTransactions,
    includedAssetHistoryAccountById,
    selectedInsightType,
    transactionMonthKeyById,
  ]);
  const assetHistorySortedDeltaMonthKeys = useMemo(
    () => Array.from(assetHistoryMonthlyDeltas.keys()).sort((a, b) => a.localeCompare(b)),
    [assetHistoryMonthlyDeltas],
  );
  const hasPeriodFilter = activeInsightFilterConfig.fixedPeriodPreset === null;
  const hasAccountFilter = activeInsightFilterConfig.allowAccountFilter;
  const hasExpenseTrendExclusionFilter = selectedInsightType === 'expense_trend';
  const hasIncomeTrendExclusionFilter = selectedInsightType === 'income_trend';
  const hasSavingsCategoryExclusionFilter = selectedInsightType === 'savings_rate';
  const hasTimeCostExpenseCategoryExclusionFilter = selectedInsightType === 'time_cost_leaderboard';
  const hasAssetHistoryAccountExclusionFilter = selectedInsightType === 'asset_history';
  const hasInsightsFilters =
    hasPeriodFilter ||
    hasAccountFilter ||
    hasExpenseTrendExclusionFilter ||
    hasIncomeTrendExclusionFilter ||
    hasSavingsCategoryExclusionFilter ||
    hasTimeCostExpenseCategoryExclusionFilter ||
    hasAssetHistoryAccountExclusionFilter;
  const incomeRateHistoryPoints = useMemo<IncomeRatePoint[]>(() => {
    const byMonth = new Map<
      string,
      {
        wageAmount: number;
        wageType: WageType;
        hoursWorkedPerWeek: number;
        updatedAt: string;
      }
    >();
    monthlyWages.forEach((item) => {
      const key = normalizeMonthKey(item.month);
      const existing = byMonth.get(key);
      if (!existing || item.updatedAt > existing.updatedAt) {
        byMonth.set(key, {
          wageAmount: item.wageAmount,
          wageType: item.wageType,
          hoursWorkedPerWeek: item.hoursWorkedPerWeek,
          updatedAt: item.updatedAt,
        });
      }
    });

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { wageAmount, wageType, hoursWorkedPerWeek }]) => ({
        monthKey: month,
        label: `${parseInt(month.slice(5, 7), 10)}/${month.slice(2, 4)}`,
        wageAmount,
        wageType,
        hoursWorkedPerWeek,
      }));
  }, [monthlyWages]);

  const shiftPeriodStateBySteps = useCallback(
    (state: PeriodState, steps: number, preset: PeriodPreset): PeriodState => {
      if (steps === 0) return state;

      if (preset === 'custom') {
        const start = parseDateInput(state.customStart);
        const end = parseDateInput(state.customEnd);
        if (!start || !end) return state;
        const days = rangeLengthDays(toRange(start, end));
        const nextStart = new Date(start);
        const nextEnd = new Date(end);
        nextStart.setDate(nextStart.getDate() + days * steps);
        nextEnd.setDate(nextEnd.getDate() + days * steps);
        return {
          anchorDate: state.anchorDate,
          customStart: formatDateInput(nextStart),
          customEnd: formatDateInput(nextEnd),
        };
      }

      return {
        anchorDate: addPeriodBySteps(state.anchorDate, preset, steps),
        customStart: state.customStart,
        customEnd: state.customEnd,
      };
    },
    [],
  );

  const buildPageData = useCallback(
    (
      state: PeriodState,
      insightType: InsightType,
      periodPresetOverride: PeriodPreset,
    ): InsightPageData => {
      const range = getPeriodRange(
        periodPresetOverride,
        state.anchorDate,
        state.customStart,
        state.customEnd,
      );
      const rangeStartMs = Date.parse(range.start);
      const rangeEndMs = Date.parse(range.end);
      const inRangeTransactions: TransactionWithRelations[] = [];
      accountScopedNonTransferEntries.forEach((entry) => {
        if (entry.timestamp < rangeStartMs || entry.timestamp > rangeEndMs) return;
        inRangeTransactions.push(entry.transaction);
      });

      if (insightType === 'expense_trend') {
        const year = state.anchorDate.getFullYear();
        const isYearPeriod = periodPresetOverride === 'year';
        const granularity: TrendGranularity = isYearPeriod ? 'month' : 'day';
        const periodKey = isYearPeriod ? String(year) : `${range.start}|${range.end}`;

        let monthRowsSeed: ExpenseTrendMonthRow[];
        if (isYearPeriod) {
          const monthLabels = monthLabelsForYear(year, activeLocale);
          monthRowsSeed = Array.from({ length: 12 }, (_, monthIndex) => ({
            monthKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
            axisLabel: monthLabels[monthIndex] ?? '',
            axisSubLabel: null,
            label: monthLabels[monthIndex] ?? '',
            totalExpense: 0,
            transactionCount: 0,
            topCategoryLabel: null,
            topCategoryEmoji: null,
            topCategoryAmount: 0,
            transactions: [],
          }));
        } else {
          const dayKeys = generateDayKeysForRange(range.start, range.end);
          monthRowsSeed = dayKeys.map((dk) => ({
            monthKey: dk,
            axisLabel:
              periodPresetOverride === 'week'
                ? weekdayLabelShort(dk, activeLocale)
                : dayLabelShort(dk, activeLocale),
            axisSubLabel:
              periodPresetOverride === 'week' ? numericDateLabelShort(dk, activeLocale) : null,
            label: dayLabelShort(dk, activeLocale),
            totalExpense: 0,
            transactionCount: 0,
            topCategoryLabel: null,
            topCategoryEmoji: null,
            topCategoryAmount: 0,
            transactions: [],
          }));
        }

        const monthRowByKey = new Map(monthRowsSeed.map((row) => [row.monthKey, row]));
        const categoryTotalsByMonthKey = new Map<
          string,
          Map<string, { id: string; label: string; emoji: string; amount: number }>
        >();
        const filteredForRange: TransactionWithRelations[] = [];
        let totalExpense = 0;

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense') return;
          if (tx.accountId && excludedExpenseTrendAccountSet.has(tx.accountId)) return;
          if (tx.categoryId) {
            const category = categoryById.get(tx.categoryId);
            const rootCategoryId = category?.parentId ?? tx.categoryId;
            if (
              excludedExpenseTrendExpenseCategorySet.has(tx.categoryId) ||
              excludedExpenseTrendExpenseCategorySet.has(rootCategoryId)
            ) {
              return;
            }
          }
          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isYearPeriod
            ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date))
            : (transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date));
          const monthRow = monthRowByKey.get(rowKey);
          if (!monthRow) return;

          filteredForRange.push(tx);
          monthRow.totalExpense += value;
          monthRow.transactionCount += 1;
          monthRow.transactions.push(tx);
          totalExpense += value;

          const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
          const root = category?.parentId ? categoryById.get(category.parentId) : category;
          const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
          const fallbackRootKey = fallbackRootLabel
            ? `legacy-root:${fallbackRootLabel.toLowerCase()}`
            : null;
          const categoryId = root?.id ?? fallbackRootKey ?? 'uncategorized';
          const categoryLabel = String(
            root?.name ?? fallbackRootLabel ?? I18n.t('common.uncategorized'),
          );
          const categoryEmoji = root?.icon ?? tx.categoryIcon ?? '•';
          let monthCategoryTotals = categoryTotalsByMonthKey.get(rowKey);
          if (!monthCategoryTotals) {
            monthCategoryTotals = new Map();
            categoryTotalsByMonthKey.set(rowKey, monthCategoryTotals);
          }
          const current = monthCategoryTotals.get(categoryId);
          if (current) {
            current.amount += value;
          } else {
            monthCategoryTotals.set(categoryId, {
              id: categoryId,
              label: categoryLabel,
              emoji: categoryEmoji,
              amount: value,
            });
          }
        });

        let peakMonthKey: string | null = null;
        let peakMonthExpense = 0;
        const monthRows = monthRowsSeed.map((row) => {
          const topCategory =
            Array.from(categoryTotalsByMonthKey.get(row.monthKey)?.values() ?? []).sort(
              (a, b) => b.amount - a.amount,
            )[0] ?? null;
          const transactions =
            row.transactions.length < 2
              ? row.transactions
              : row.transactions.sort((a, b) => {
                  const dateDelta = b.date.localeCompare(a.date);
                  if (dateDelta !== 0) return dateDelta;
                  return b.createdAt.localeCompare(a.createdAt);
                });
          const nextRow = {
            ...row,
            topCategoryLabel: topCategory?.label ?? null,
            topCategoryEmoji: topCategory?.emoji ?? null,
            topCategoryAmount: topCategory?.amount ?? 0,
            transactions,
          };
          if (nextRow.totalExpense > 0) {
            if (peakMonthKey === null || nextRow.totalExpense > peakMonthExpense) {
              peakMonthKey = nextRow.monthKey;
              peakMonthExpense = nextRow.totalExpense;
            }
          }
          return nextRow;
        });
        const activeMonths = monthRows.filter((row) => row.totalExpense > 0).length;

        return {
          kind: 'expense_trend',
          year,
          periodKey,
          granularity,
          range,
          filteredForRange,
          monthRows,
          averageMonthExpense: activeMonths > 0 ? totalExpense / activeMonths : 0,
          activeMonths,
          peakMonthKey,
        };
      }

      if (insightType === 'income_trend') {
        const year = state.anchorDate.getFullYear();
        const isYearPeriod = periodPresetOverride === 'year';
        const granularity: TrendGranularity = isYearPeriod ? 'month' : 'day';
        const periodKey = isYearPeriod ? String(year) : `${range.start}|${range.end}`;

        let monthRowsSeed: IncomeTrendMonthRow[];
        if (isYearPeriod) {
          const monthLabels = monthLabelsForYear(year, activeLocale);
          monthRowsSeed = Array.from({ length: 12 }, (_, monthIndex) => ({
            monthKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
            axisLabel: monthLabels[monthIndex] ?? '',
            axisSubLabel: null,
            label: monthLabels[monthIndex] ?? '',
            totalIncome: 0,
            transactionCount: 0,
            topCategoryLabel: null,
            topCategoryEmoji: null,
            topCategoryAmount: 0,
            transactions: [],
          }));
        } else {
          const dayKeys = generateDayKeysForRange(range.start, range.end);
          monthRowsSeed = dayKeys.map((dk) => ({
            monthKey: dk,
            axisLabel:
              periodPresetOverride === 'week'
                ? weekdayLabelShort(dk, activeLocale)
                : dayLabelShort(dk, activeLocale),
            axisSubLabel:
              periodPresetOverride === 'week' ? numericDateLabelShort(dk, activeLocale) : null,
            label: dayLabelShort(dk, activeLocale),
            totalIncome: 0,
            transactionCount: 0,
            topCategoryLabel: null,
            topCategoryEmoji: null,
            topCategoryAmount: 0,
            transactions: [],
          }));
        }

        const monthRowByKey = new Map(monthRowsSeed.map((row) => [row.monthKey, row]));
        const categoryTotalsByMonthKey = new Map<
          string,
          Map<string, { id: string; label: string; emoji: string; amount: number }>
        >();
        const filteredForRange: TransactionWithRelations[] = [];
        let totalIncome = 0;

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'income') return;
          if (tx.accountId && excludedIncomeTrendAccountSet.has(tx.accountId)) return;
          if (tx.categoryId) {
            const category = categoryById.get(tx.categoryId);
            const rootCategoryId = category?.parentId ?? tx.categoryId;
            if (
              excludedIncomeTrendIncomeCategorySet.has(tx.categoryId) ||
              excludedIncomeTrendIncomeCategorySet.has(rootCategoryId)
            ) {
              return;
            }
          }
          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isYearPeriod
            ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date))
            : (transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date));
          const monthRow = monthRowByKey.get(rowKey);
          if (!monthRow) return;

          filteredForRange.push(tx);
          monthRow.totalIncome += value;
          monthRow.transactionCount += 1;
          monthRow.transactions.push(tx);
          totalIncome += value;

          const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
          const root = category?.parentId ? categoryById.get(category.parentId) : category;
          const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
          const fallbackRootKey = fallbackRootLabel
            ? `legacy-root:${fallbackRootLabel.toLowerCase()}`
            : null;
          const categoryId = root?.id ?? fallbackRootKey ?? 'uncategorized';
          const categoryLabel = String(
            root?.name ?? fallbackRootLabel ?? I18n.t('common.uncategorized'),
          );
          const categoryEmoji = root?.icon ?? tx.categoryIcon ?? '•';
          let monthCategoryTotals = categoryTotalsByMonthKey.get(rowKey);
          if (!monthCategoryTotals) {
            monthCategoryTotals = new Map();
            categoryTotalsByMonthKey.set(rowKey, monthCategoryTotals);
          }
          const current = monthCategoryTotals.get(categoryId);
          if (current) {
            current.amount += value;
          } else {
            monthCategoryTotals.set(categoryId, {
              id: categoryId,
              label: categoryLabel,
              emoji: categoryEmoji,
              amount: value,
            });
          }
        });

        let peakMonthKey: string | null = null;
        let peakMonthIncome = 0;
        const monthRows = monthRowsSeed.map((row) => {
          const topCategory =
            Array.from(categoryTotalsByMonthKey.get(row.monthKey)?.values() ?? []).sort(
              (a, b) => b.amount - a.amount,
            )[0] ?? null;
          const transactions =
            row.transactions.length < 2
              ? row.transactions
              : row.transactions.sort((a, b) => {
                  const dateDelta = b.date.localeCompare(a.date);
                  if (dateDelta !== 0) return dateDelta;
                  return b.createdAt.localeCompare(a.createdAt);
                });
          const nextRow = {
            ...row,
            topCategoryLabel: topCategory?.label ?? null,
            topCategoryEmoji: topCategory?.emoji ?? null,
            topCategoryAmount: topCategory?.amount ?? 0,
            transactions,
          };
          if (nextRow.totalIncome > 0) {
            if (peakMonthKey === null || nextRow.totalIncome > peakMonthIncome) {
              peakMonthKey = nextRow.monthKey;
              peakMonthIncome = nextRow.totalIncome;
            }
          }
          return nextRow;
        });
        const activeMonths = monthRows.filter((row) => row.totalIncome > 0).length;

        return {
          kind: 'income_trend',
          year,
          periodKey,
          granularity,
          range,
          filteredForRange,
          monthRows,
          averageMonthIncome: activeMonths > 0 ? totalIncome / activeMonths : 0,
          activeMonths,
          peakMonthKey,
        };
      }

      if (insightType === 'expense_sentiment') {
        const dayKeys = generateDayKeysForRange(range.start, range.end);
        const isWeekView = periodPresetOverride === 'week';
        const useDetailedDayLabels = isWeekView || dayKeys.length <= 7;
        const dayRowByKey = new Map<string, SentimentDayRow>();
        dayKeys.forEach((dk) => {
          dayRowByKey.set(dk, {
            dayKey: dk,
            label: useDetailedDayLabels ? weekdayLabelShort(dk, activeLocale) : dayNumberLabel(dk),
            subLabel: useDetailedDayLabels ? numericDateLabelShort(dk, activeLocale) : null,
            happy: 0,
            neutral: 0,
            sad: 0,
            total: 0,
          });
        });

        const filteredForRange: TransactionWithRelations[] = [];
        const totals = { happy: 0, neutral: 0, sad: 0 };

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense') return;
          const dayKey = transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date);
          const dayRow = dayRowByKey.get(dayKey);
          if (!dayRow) return;

          filteredForRange.push(tx);
          const sentiment = tx.sentiment ?? 'neutral';
          dayRow[sentiment] += 1;
          dayRow.total += 1;
          totals[sentiment] += 1;
        });

        return {
          kind: 'expense_sentiment',
          range,
          filteredForRange,
          dayRows: dayKeys.map((dk) => dayRowByKey.get(dk)!),
          totals,
        };
      }

      if (insightType === 'asset_history') {
        const includedAccounts = includedAssetHistoryAccounts;
        const year = state.anchorDate.getFullYear();
        const monthLabels = monthLabelsForYear(year, activeLocale);
        const monthRowsSeed: AssetHistoryMonthRow[] = Array.from(
          { length: 12 },
          (_, monthIndex) => ({
            monthKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
            label: monthLabels[monthIndex] ?? '',
            totalAssets: 0,
          }),
        );

        if (includedAccounts.length === 0) {
          return {
            kind: 'asset_history',
            year,
            range,
            filteredForRange: [],
            monthRows: monthRowsSeed,
            includedAccountsCount: 0,
          };
        }

        let runningTotalAssets = includedAccounts.reduce(
          (sum, account) => sum + account.startingBalance,
          0,
        );
        let deltaMonthIndex = 0;
        const monthRows = monthRowsSeed.map((seedRow) => {
          while (
            deltaMonthIndex < assetHistorySortedDeltaMonthKeys.length &&
            (assetHistorySortedDeltaMonthKeys[deltaMonthIndex] ?? '') <= seedRow.monthKey
          ) {
            const deltaMap = assetHistoryMonthlyDeltas.get(
              assetHistorySortedDeltaMonthKeys[deltaMonthIndex] ?? '',
            );
            deltaMap?.forEach((delta) => {
              runningTotalAssets += delta;
            });
            deltaMonthIndex += 1;
          }

          return { ...seedRow, totalAssets: runningTotalAssets };
        });

        return {
          kind: 'asset_history',
          year,
          range,
          filteredForRange: [],
          monthRows,
          includedAccountsCount: includedAccounts.length,
        };
      }

      if (insightType === 'income_rate_history') {
        return {
          kind: 'income_rate_history',
          range,
          filteredForRange: [],
          points: incomeRateHistoryPoints,
        };
      }

      if (insightType === 'calendar_view') {
        const filteredForRange: TransactionWithRelations[] = [];
        const dailyTotalsByDayKey = new Map<string, CalendarDayAggregate>();
        let totalExpense = 0;

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense') return;
          filteredForRange.push(tx);

          const dayKey = transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date);
          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          const current = dailyTotalsByDayKey.get(dayKey) ?? {
            dayKey,
            income: 0,
            expense: 0,
            net: 0,
            transactions: [],
          };
          current.expense += value;
          totalExpense += value;
          current.net = current.income - current.expense;
          current.transactions.push(tx);
          dailyTotalsByDayKey.set(dayKey, current);
        });

        dailyTotalsByDayKey.forEach((entry) => {
          if (entry.transactions.length < 2) return;
          entry.transactions.sort((a, b) => {
            const dateDelta = b.date.localeCompare(a.date);
            if (dateDelta !== 0) return dateDelta;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });

        const topEmojiByDayKey = new Map<string, string>();
        dailyTotalsByDayKey.forEach((entry, dayKey) => {
          if (entry.transactions.length === 0) return;
          const amountByCategory = new Map<string, { amount: number; emoji: string }>();
          for (const tx of entry.transactions) {
            const catId = tx.categoryId ?? 'uncategorized';
            const emoji = tx.categoryIcon ?? null;
            if (!emoji) continue;
            const existing = amountByCategory.get(catId);
            if (existing) {
              existing.amount += tx.amount;
            } else {
              amountByCategory.set(catId, { amount: tx.amount, emoji });
            }
          }
          let topEmoji: string | null = null;
          let topAmount = 0;
          amountByCategory.forEach(({ amount, emoji }) => {
            if (amount > topAmount) {
              topAmount = amount;
              topEmoji = emoji;
            }
          });
          if (topEmoji) topEmojiByDayKey.set(dayKey, topEmoji);
        });

        const rangeStartDayKey = dayKeyFromIsoLocal(range.start);
        const rangeEndDayKey = dayKeyFromIsoLocal(range.end);
        const todayDayKey = dayKeyFromDateLocal(new Date());
        let minDailyExpense = Number.POSITIVE_INFINITY;
        let maxDailyExpense = 0;
        let latestPastOrTodayActivityDay: string | null = null;
        dailyTotalsByDayKey.forEach((entry, dayKey) => {
          if (dayKey < rangeStartDayKey || dayKey > rangeEndDayKey) return;
          if (entry.expense <= 0) return;
          if (entry.expense < minDailyExpense) minDailyExpense = entry.expense;
          if (entry.expense > maxDailyExpense) maxDailyExpense = entry.expense;
          if (
            dayKey <= todayDayKey &&
            (!latestPastOrTodayActivityDay || dayKey > latestPastOrTodayActivityDay)
          ) {
            latestPastOrTodayActivityDay = dayKey;
          }
        });

        const monthSections: CalendarMonthSection[] = [];
        const firstMonthDate = monthStartUtcDateFromMonthKey(monthKeyFromDayKey(rangeStartDayKey));
        const endMonthKey = monthKeyFromDayKey(rangeEndDayKey);
        if (firstMonthDate) {
          const cursor = new Date(firstMonthDate);
          while (monthKeyFromUtcDate(cursor) <= endMonthKey) {
            const monthKey = monthKeyFromUtcDate(cursor);
            const monthLabel = monthLabelFromMonthKey(monthKey, activeLocale);
            const daysInMonth = new Date(
              Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
            ).getUTCDate();
            const leadingSpacers = weekdayColumnIndexMonday(`${monthKey}-01`);
            const cells: CalendarGridCell[] = [];

            for (let spacer = 0; spacer < leadingSpacers; spacer += 1) {
              cells.push({ kind: 'spacer', id: `${monthKey}-spacer-${spacer}` });
            }

            let activeDayCount = 0;
            for (let day = 1; day <= daysInMonth; day += 1) {
              const dayNumber = String(day).padStart(2, '0');
              const dayKey = `${monthKey}-${dayNumber}`;
              const totals = dailyTotalsByDayKey.get(dayKey);
              const income = totals?.income ?? 0;
              const expense = totals?.expense ?? 0;
              const net = totals?.net ?? 0;
              const isOutsideRange = dayKey < rangeStartDayKey || dayKey > rangeEndDayKey;
              const isFuture = dayKey > todayDayKey;
              const hasExpense = expense > 0 && !isOutsideRange;
              const hasRange = Number.isFinite(minDailyExpense) && maxDailyExpense > 0;
              const hasSpread = hasRange && maxDailyExpense > minDailyExpense;
              let expenseDotTier: 0 | 1 | 2 | 3 | 4 | 5 = 0;
              if (hasExpense) {
                if (!hasSpread) {
                  expenseDotTier = 3;
                } else {
                  const normalized =
                    (expense - minDailyExpense) / (maxDailyExpense - minDailyExpense);
                  const quantized = Math.round(normalized * 4) + 1;
                  expenseDotTier = clampCalendarExpenseDotTier(quantized);
                }
              }

              if (!isOutsideRange) activeDayCount += 1;
              cells.push({
                kind: 'day',
                id: dayKey,
                dayKey,
                dayNumber: day,
                income,
                expense,
                net,
                transactionCount: totals?.transactions.length ?? 0,
                isOutsideRange,
                isFuture,
                expenseDotTier,
                topCategoryEmoji: totals ? (topEmojiByDayKey.get(dayKey) ?? null) : null,
              });
            }

            const trailingSpacers = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
            for (let spacer = 0; spacer < trailingSpacers; spacer += 1) {
              cells.push({ kind: 'spacer', id: `${monthKey}-end-spacer-${spacer}` });
            }

            monthSections.push({
              monthKey,
              label: monthLabel,
              activeDayCount,
              cells,
            });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
          }
        }

        let defaultSelectedDayKey = rangeEndDayKey;
        if (latestPastOrTodayActivityDay) {
          defaultSelectedDayKey = latestPastOrTodayActivityDay;
        } else if (todayDayKey >= rangeStartDayKey && todayDayKey <= rangeEndDayKey) {
          defaultSelectedDayKey = todayDayKey;
        } else if (todayDayKey < rangeStartDayKey) {
          defaultSelectedDayKey = rangeStartDayKey;
        }

        return {
          kind: 'calendar',
          range,
          filteredForRange,
          dailyTotalsByDayKey,
          monthSections,
          rangeStartDayKey,
          rangeEndDayKey,
          defaultSelectedDayKey,
          totalIncome: 0,
          totalExpense,
          totalNet: -totalExpense,
        };
      }

      if (insightType === 'time_cost_leaderboard') {
        const filteredForRange: TransactionWithRelations[] = [];
        const categoryTotals = new Map<string, TimeCostCategoryRow>();
        const transactionRows: TimeCostTransactionRow[] = [];
        const hourlyRateByMonth = new Map<string, number>();
        let totalHours = 0;
        let totalAmount = 0;

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense' || tx.amount <= 0) return;
          if (excludedTimeCostExpenseCategorySet.size > 0 && tx.categoryId) {
            const category = categoryById.get(tx.categoryId);
            const rootCategoryId = category?.parentId ?? tx.categoryId;
            if (
              excludedTimeCostExpenseCategorySet.has(tx.categoryId) ||
              excludedTimeCostExpenseCategorySet.has(rootCategoryId)
            ) {
              return;
            }
          }
          filteredForRange.push(tx);

          const txMonthKey = transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date);
          let trueHourlyRate = hourlyRateByMonth.get(txMonthKey);
          if (trueHourlyRate === undefined) {
            trueHourlyRate = getTrueHourlyRateForDate(tx.date);
            hourlyRateByMonth.set(txMonthKey, trueHourlyRate);
          }
          if (trueHourlyRate <= 0) return;

          const hours = amountToHoursByRate(tx.amount, trueHourlyRate);
          if (!Number.isFinite(hours) || hours <= 0) return;

          const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
          const root = category?.parentId ? categoryById.get(category.parentId) : category;
          const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
          const fallbackRootKey = fallbackRootLabel
            ? `legacy-root:${fallbackRootLabel.toLowerCase()}`
            : null;
          const categoryId = root?.id ?? fallbackRootKey ?? 'uncategorized';
          const categoryLabel = String(
            root?.name ?? fallbackRootLabel ?? I18n.t('common.uncategorized'),
          );
          const categoryEmoji = root?.icon ?? tx.categoryIcon ?? '•';
          const categoryRow = categoryTotals.get(categoryId);

          if (categoryRow) {
            categoryRow.hours += hours;
            categoryRow.amount += tx.amount;
            categoryRow.count += 1;
            categoryRow.transactions.push(tx);
          } else {
            categoryTotals.set(categoryId, {
              id: categoryId,
              label: categoryLabel,
              emoji: categoryEmoji,
              hours,
              amount: tx.amount,
              count: 1,
              sharePct: 0,
              transactions: [tx],
            });
          }

          const label = String(
            tx.note?.trim() ||
              tx.categoryName ||
              tx.categoryParentName ||
              I18n.t('common.uncategorized'),
          );
          const subtitle = String(tx.accountName ?? I18n.t('common.no_account'));
          transactionRows.push({
            id: tx.id,
            transaction: tx,
            label,
            subtitle,
            hours,
            amount: tx.amount,
            sharePct: 0,
          });
          totalHours += hours;
          totalAmount += tx.amount;
        });

        const categoryRows = Array.from(categoryTotals.values())
          .sort((a, b) => b.hours - a.hours)
          .map((row) => ({
            ...row,
            transactions:
              row.transactions.length < 2
                ? row.transactions
                : row.transactions.sort((a, b) => {
                    const dateDelta = b.date.localeCompare(a.date);
                    if (dateDelta !== 0) return dateDelta;
                    return b.createdAt.localeCompare(a.createdAt);
                  }),
            sharePct: totalHours > 0 ? (row.hours / totalHours) * 100 : 0,
          }))
          .slice(0, 8);

        const rankedTransactions = transactionRows
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 12)
          .map((row) => ({
            ...row,
            sharePct: totalHours > 0 ? (row.hours / totalHours) * 100 : 0,
          }));

        return {
          kind: 'time_cost',
          range,
          filteredForRange,
          hasTimeContext: canUseTimeDisplayMode,
          totalHours,
          totalAmount,
          categoryRows,
          transactionRows: rankedTransactions,
        };
      }

      if (isAnalyticsInsightType(insightType)) {
        const rangeStartDayKey = dayKeyFromIsoLocal(range.start);
        const rangeEndDayKey = dayKeyFromIsoLocal(range.end);
        const startDate = dayKeyToUtcDate(rangeStartDayKey);
        const endDate = dayKeyToUtcDate(rangeEndDayKey);
        const dailyRows: InsightAnalyticsDayRow[] = [];
        const dayByKey = new Map<string, InsightAnalyticsDayRow>();
        const savingsYear = new Date(range.start).getFullYear();
        const monthLabels = monthLabelsForYear(savingsYear, activeLocale);
        const savingsRateRows: InsightAnalyticsSavingsRateMonthRow[] = Array.from(
          { length: 12 },
          (_, monthIndex) => ({
            monthKey: `${savingsYear}-${String(monthIndex + 1).padStart(2, '0')}`,
            label: monthLabels[monthIndex] ?? '',
            income: 0,
            expense: 0,
            net: 0,
            savingsRate: null,
            transactions: [],
          }),
        );
        const savingsRateRowByMonth = new Map(savingsRateRows.map((row) => [row.monthKey, row]));
        const transactionsForAnalytics: TransactionWithRelations[] = [];
        let totalIncome = 0;
        let totalExpense = 0;

        if (startDate && endDate) {
          const cursor = new Date(startDate);
          while (cursor.getTime() <= endDate.getTime()) {
            const year = cursor.getUTCFullYear();
            const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
            const day = String(cursor.getUTCDate()).padStart(2, '0');
            const dayKey = `${year}-${month}-${day}`;
            const row: InsightAnalyticsDayRow = {
              dayKey,
              income: 0,
              expense: 0,
              net: 0,
              transactionCount: 0,
              transactions: [],
            };
            dailyRows.push(row);
            dayByKey.set(dayKey, row);
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
        }

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'income' && tx.type !== 'expense') return;

          const categoryId = tx.categoryId;
          if (categoryId) {
            const category = categoryById.get(categoryId);
            const rootCategoryId = category?.parentId ?? categoryId;
            if (tx.type === 'income') {
              if (
                excludedSavingsIncomeCategorySet.has(categoryId) ||
                excludedSavingsIncomeCategorySet.has(rootCategoryId)
              ) {
                return;
              }
            } else if (
              excludedSavingsExpenseCategorySet.has(categoryId) ||
              excludedSavingsExpenseCategorySet.has(rootCategoryId)
            ) {
              return;
            }
          }

          transactionsForAnalytics.push(tx);

          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          const dayKey = transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date);
          const row = dayByKey.get(dayKey);
          if (row) {
            if (tx.type === 'income') {
              row.income += value;
            } else {
              row.expense += value;
            }
            row.net = row.income - row.expense;
            row.transactionCount += 1;
            row.transactions.push(tx);
          }

          const monthKey = transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date);
          const monthRow = savingsRateRowByMonth.get(monthKey);
          if (monthRow) {
            if (tx.type === 'income') {
              monthRow.income += value;
            } else {
              monthRow.expense += value;
            }
            monthRow.transactions.push(tx);
          }

          if (tx.type === 'income') {
            totalIncome += value;
          } else {
            totalExpense += value;
          }
        });

        dailyRows.forEach((row) => {
          if (row.transactions.length < 2) return;
          row.transactions.sort((a, b) => {
            const dateDelta = b.date.localeCompare(a.date);
            if (dateDelta !== 0) return dateDelta;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });
        savingsRateRows.forEach((row) => {
          row.net = row.income - row.expense;
          row.savingsRate = row.income > 0 ? row.net / row.income : null;
          if (row.transactions.length < 2) return;
          row.transactions.sort((a, b) => {
            const dateDelta = b.date.localeCompare(a.date);
            if (dateDelta !== 0) return dateDelta;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });

        return {
          kind: 'analytics',
          insightType,
          range,
          filteredForRange: transactionsForAnalytics,
          totalIncome,
          totalExpense,
          totalNet: totalIncome - totalExpense,
          periodDays: dailyRows.length,
          dailyRows,
          savingsRateRows,
        };
      }

      if (!isBreakdownInsightType(insightType)) {
        return {
          kind: 'calendar',
          range,
          filteredForRange: [],
          dailyTotalsByDayKey: new Map<string, CalendarDayAggregate>(),
          monthSections: [],
          rangeStartDayKey: dayKeyFromIsoLocal(range.start),
          rangeEndDayKey: dayKeyFromIsoLocal(range.end),
          defaultSelectedDayKey: dayKeyFromIsoLocal(range.start),
          totalIncome: 0,
          totalExpense: 0,
          totalNet: 0,
        };
      }

      const transactionType = transactionTypeFromInsightType(insightType);
      const filteredForRange: TransactionWithRelations[] = [];
      const breakdownTotals = new Map<
        string,
        { id: string; label: string; amount: number; count: number; emoji: string }
      >();
      const breakdownTransactionsById = new Map<string, TransactionWithRelations[]>();
      inRangeTransactions.forEach((tx) => {
        if (tx.type !== transactionType) return;
        filteredForRange.push(tx);

        const id = resolveBreakdownRootId(tx, categoryById);
        const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
        const root = category?.parentId ? categoryById.get(category.parentId) : category;
        const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
        const label = String(root?.name ?? fallbackRootLabel ?? I18n.t('common.uncategorized'));
        const emoji = root?.icon ?? tx.categoryIcon ?? '•';
        const value =
          settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;

        const current = breakdownTotals.get(id);
        if (current) {
          current.amount += value;
          current.count += 1;
          if (!current.emoji && emoji) current.emoji = emoji;
        } else {
          breakdownTotals.set(id, { id, label, amount: value, count: 1, emoji });
        }

        const existingRows = breakdownTransactionsById.get(id);
        if (existingRows) {
          existingRows.push(tx);
        } else {
          breakdownTransactionsById.set(id, [tx]);
        }
      });
      const categoryRows = Array.from(breakdownTotals.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);
      return {
        kind: 'breakdown',
        range,
        categoryRows,
        filteredForRange,
        breakdownTransactionsById,
        transactionType,
      };
    },
    [
      accountScopedNonTransferEntries,
      assetHistoryMonthlyDeltas,
      assetHistorySortedDeltaMonthKeys,
      canUseTimeDisplayMode,
      categoryById,
      excludedExpenseTrendAccountSet,
      excludedExpenseTrendExpenseCategorySet,
      excludedIncomeTrendAccountSet,
      excludedIncomeTrendIncomeCategorySet,
      excludedSavingsExpenseCategorySet,
      excludedSavingsIncomeCategorySet,
      excludedTimeCostExpenseCategorySet,
      getTrueHourlyRateForDate,
      getDisplayValueForTransaction,
      incomeRateHistoryPoints,
      includedAssetHistoryAccounts,
      activeLocale,
      settings.displayMode,
      transactionDayKeyById,
      transactionMonthKeyById,
    ],
  );
  const prevBuildPageDataRef = useRef(buildPageData);
  if (prevBuildPageDataRef.current !== buildPageData) {
    prevBuildPageDataRef.current = buildPageData;
    pageDataCacheRef.current.clear();
  }
  const getCachedPageData = useCallback(
    (
      state: PeriodState,
      insightType: InsightType,
      periodPresetOverride: PeriodPreset,
    ): InsightPageData => {
      const cacheKey = [
        insightType,
        periodPresetOverride,
        state.anchorDate.toISOString(),
        state.customStart,
        state.customEnd,
      ].join('|');
      const cachedPageData = pageDataCacheRef.current.get(cacheKey);
      if (cachedPageData) return cachedPageData;

      const nextPageData = buildPageData(state, insightType, periodPresetOverride);
      if (pageDataCacheRef.current.size >= 72) {
        pageDataCacheRef.current.clear();
      }
      pageDataCacheRef.current.set(cacheKey, nextPageData);
      return nextPageData;
    },
    [buildPageData],
  );
  const currentPeriodState = useMemo<PeriodState>(
    () => ({ anchorDate, customStart, customEnd }),
    [anchorDate, customEnd, customStart],
  );
  const displaySelectedInsightType =
    pendingActivityBreakdownTarget?.insightType ?? selectedInsightType;
  const displayPeriodPreset = pendingActivityBreakdownTarget
    ? (pendingActivityBreakdownTarget.periodPreset ??
      getInsightFilterConfig(pendingActivityBreakdownTarget.insightType).fixedPeriodPreset ??
      'month')
    : effectivePeriodPreset;
  const displayCurrentPeriodState =
    pendingActivityBreakdownTarget?.periodState ?? currentPeriodState;
  const displayCommittedPageIndex = pendingActivityBreakdownTarget
    ? INSIGHTS_PAGER_CENTER_INDEX
    : committedPageIndexRef.current;
  const displayHeaderPreviewPageIndex = pendingActivityBreakdownTarget
    ? INSIGHTS_PAGER_CENTER_INDEX
    : headerPreviewPageIndex;
  const currentPage = useMemo(
    () =>
      getCachedPageData(displayCurrentPeriodState, displaySelectedInsightType, displayPeriodPreset),
    [displayCurrentPeriodState, displayPeriodPreset, displaySelectedInsightType, getCachedPageData],
  );
  const headerPreviewOffset = displayHeaderPreviewPageIndex - displayCommittedPageIndex;
  const headerPreviewPeriodState = useMemo(
    () =>
      shiftPeriodStateBySteps(displayCurrentPeriodState, headerPreviewOffset, displayPeriodPreset),
    [displayCurrentPeriodState, displayPeriodPreset, headerPreviewOffset, shiftPeriodStateBySteps],
  );
  const headerPreviewRange = useMemo(
    () =>
      getPeriodRange(
        displayPeriodPreset,
        headerPreviewPeriodState.anchorDate,
        headerPreviewPeriodState.customStart,
        headerPreviewPeriodState.customEnd,
      ),
    [displayPeriodPreset, headerPreviewPeriodState],
  );
  const currentCalendarDefaultDayKey =
    currentPage.kind === 'calendar' ? currentPage.defaultSelectedDayKey : '';
  const activePeriodLabel = useMemo(
    () => periodLabel(displayPeriodPreset, headerPreviewRange, activeLocale),
    [activeLocale, displayPeriodPreset, headerPreviewRange],
  );

  const renderValueNode = useCallback(
    (
      value: number,
      options: {
        variant?: React.ComponentProps<typeof Text>['variant'];
        tone?: React.ComponentProps<typeof Text>['tone'];
        textClassName?: string;
        containerClassName?: string;
        iconColor?: string;
        iconSize?: number;
        style?: React.ComponentProps<typeof Text>['style'];
      } = {},
    ) => {
      const {
        variant = 'caption',
        tone = 'default',
        textClassName,
        containerClassName,
        iconColor,
        iconSize,
        style,
      } = options;

      if (settings.displayMode === 'time') {
        return (
          <TimeValueInline
            value={formatHours(value)}
            variant={variant}
            tone={tone}
            textClassName={textClassName}
            containerClassName={containerClassName}
            iconColor={iconColor}
            iconSize={iconSize}
            style={style}
          />
        );
      }

      return (
        <Text variant={variant} tone={tone} className={textClassName} style={style}>
          {formatAmount(value, settings, { showSign: false })}
        </Text>
      );
    },
    [settings],
  );
  const renderCompactValueNode = useCallback(
    (
      value: number,
      options: {
        variant?: React.ComponentProps<typeof Text>['variant'];
        tone?: React.ComponentProps<typeof Text>['tone'];
        textClassName?: string;
        containerClassName?: string;
        iconColor?: string;
        iconSize?: number;
        style?: React.ComponentProps<typeof Text>['style'];
      } = {},
    ) => {
      const {
        variant = 'label',
        tone = 'default',
        textClassName,
        containerClassName,
        iconColor,
        iconSize,
        style,
      } = options;

      if (settings.displayMode === 'time') {
        return (
          <TimeValueInline
            value={formatHours(value)}
            variant={variant}
            tone={tone}
            textClassName={textClassName}
            containerClassName={containerClassName}
            iconColor={iconColor}
            iconSize={iconSize}
            style={style}
          />
        );
      }

      return (
        <Text variant={variant} tone={tone} className={textClassName} style={style}>
          {formatCompactCurrency(value, settings.currencySymbol)}
        </Text>
      );
    },
    [settings.currencySymbol, settings.displayMode],
  );
  const renderMoneyAmount = useCallback(
    (amount: number) => formatAmount(amount, settings, { showSign: false, trueHourlyRate: 0 }),
    [settings],
  );
  const formatAxisCurrencyValue = useCallback(
    (value: number) =>
      `${value < 0 ? '-' : ''}${formatCompactCurrency(Math.abs(value), settings.currencySymbol)}`,
    [settings.currencySymbol],
  );
  const formatAxisAssetValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? `${value < 0 ? '-' : ''}${formatHours(Math.abs(value))}`
        : formatAxisCurrencyValue(value),
    [formatAxisCurrencyValue, settings.displayMode],
  );

  const chartConfig = useMemo(
    () => ({
      backgroundGradientFrom: themeColors.surface,
      backgroundGradientTo: themeColors.surface,
      decimalPlaces: 0,
      color: (opacity = 1) => {
        const r = isDark ? 52 : 31;
        const g = isDark ? 201 : 138;
        const b = isDark ? 154 : 111;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      },
      labelColor: (opacity = 1) => {
        const r = isDark ? 154 : 107;
        const g = isDark ? 172 : 122;
        const b = isDark ? 166 : 119;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      },
      propsForBackgroundLines: { stroke: themeColors.surfaceMuted, strokeWidth: 1 },
    }),
    [themeColors, isDark],
  );

  const insightsPagerSlots = useMemo<number[]>(
    () => Array.from({ length: INSIGHTS_PAGER_TOTAL_SLOTS }, (_, index) => index),
    [],
  );
  const clampInsightsPageIndex = useCallback(
    (index: number) => Math.max(0, Math.min(index, INSIGHTS_PAGER_TOTAL_SLOTS - 1)),
    [],
  );

  const resetAdjacentPagesToTop = useCallback(() => {
    getPageScrollRef(committedPageIndexRef.current - 1).current?.scrollTo({
      y: 0,
      animated: false,
    });
    getPageScrollRef(committedPageIndexRef.current + 1).current?.scrollTo({
      y: 0,
      animated: false,
    });
  }, [getPageScrollRef]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: committedPageIndexRef.current,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pageWidth]);

  const commitInsightsPageByIndex = useCallback(
    (nextIndex: number) => {
      const clampedIndex = clampInsightsPageIndex(nextIndex);
      const currentIndex = committedPageIndexRef.current;
      const steps = clampedIndex - currentIndex;
      if (steps === 0) {
        headerPreviewPageIndexRef.current = currentIndex;
        setHeaderPreviewPageIndex(currentIndex);
        return;
      }
      const nextState = shiftPeriodStateBySteps(currentPeriodState, steps, effectivePeriodPreset);
      committedPageIndexRef.current = clampedIndex;
      headerPreviewPageIndexRef.current = clampedIndex;
      setHeaderPreviewPageIndex(clampedIndex);
      setAnchorDate(nextState.anchorDate);
      setCustomStart(nextState.customStart);
      setCustomEnd(nextState.customEnd);
    },
    [clampInsightsPageIndex, currentPeriodState, effectivePeriodPreset, shiftPeriodStateBySteps],
  );

  const onMonthStep = useCallback(
    (direction: 1 | -1) => {
      resetAdjacentPagesToTop();
      const list = horizontalListRef.current;
      const currentIndex = headerPreviewPageIndexRef.current;
      const targetIndex = clampInsightsPageIndex(currentIndex + direction);

      if (!list) {
        commitInsightsPageByIndex(targetIndex);
        return;
      }

      list.scrollToIndex({
        index: targetIndex,
        animated: true,
      });
    },
    [clampInsightsPageIndex, commitInsightsPageByIndex, resetAdjacentPagesToTop],
  );

  const recenterInsightsPager = useCallback(() => {
    committedPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    headerPreviewPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    setHeaderPreviewPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
    pageScrollRefs.current.forEach((ref) => ref.current?.scrollTo({ y: 0, animated: false }));
    requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: INSIGHTS_PAGER_CENTER_INDEX,
        animated: false,
      });
    });
  }, []);

  const finalizeHorizontalShift = useCallback(
    (offsetX: number) => {
      const rawIndex = Math.round(offsetX / pageWidth);
      commitInsightsPageByIndex(rawIndex);
    },
    [commitInsightsPageByIndex, pageWidth],
  );

  const handleHorizontalScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const clampedIndex = clampInsightsPageIndex(rawIndex);
      if (clampedIndex === headerPreviewPageIndexRef.current) return;
      headerPreviewPageIndexRef.current = clampedIndex;
      setHeaderPreviewPageIndex(clampedIndex);
    },
    [clampInsightsPageIndex, pageWidth],
  );

  const handleHorizontalScrollBeginDrag = useCallback(() => {
    resetAdjacentPagesToTop();
  }, [resetAdjacentPagesToTop]);

  const handleHorizontalScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) > 0.05) return;
      finalizeHorizontalShift(event.nativeEvent.contentOffset.x);
    },
    [finalizeHorizontalShift],
  );

  const handleHorizontalMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      finalizeHorizontalShift(event.nativeEvent.contentOffset.x);
    },
    [finalizeHorizontalShift],
  );

  const handleHorizontalScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const clampedIndex = clampInsightsPageIndex(info.index);
      horizontalListRef.current?.scrollToOffset({
        offset: clampedIndex * pageWidth,
        animated: false,
      });
    },
    [clampInsightsPageIndex, pageWidth],
  );

  const getHorizontalItemLayout = useCallback(
    (_: ArrayLike<number> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );
  const insightsPagerKeyExtractor = useCallback((item: number) => String(item), []);

  const handlePrevMonth = useCallback(() => onMonthStep(-1), [onMonthStep]);
  const handleNextMonth = useCallback(() => onMonthStep(1), [onMonthStep]);

  useEffect(() => {
    const currentIndex = committedPageIndexRef.current;
    headerPreviewPageIndexRef.current = currentIndex;
    setHeaderPreviewPageIndex(currentIndex);
  }, [anchorDate, customEnd, customStart, periodPreset, selectedInsightType]);

  useEffect(() => {
    if (!hasInsightsFilters) {
      setIsFilterModalOpen(false);
    }
  }, [hasInsightsFilters]);
  useEffect(() => {
    if (selectedInsightType === 'income_rate_history' && isPeriodPickerOpen) {
      setIsPeriodPickerOpen(false);
    }
  }, [isPeriodPickerOpen, selectedInsightType]);
  useEffect(() => {
    if (selectedInsightType !== 'income_rate_history' && isIncomeRateUnitPickerOpen) {
      setIsIncomeRateUnitPickerOpen(false);
    }
  }, [isIncomeRateUnitPickerOpen, selectedInsightType]);
  useEffect(() => {
    selectedIncomeRatePointIndexRef.current = selectedIncomeRatePointIndex;
  }, [selectedIncomeRatePointIndex]);
  useEffect(() => {
    expenseTrendScrubMonthByYearRef.current = expenseTrendScrubMonthByYear;
  }, [expenseTrendScrubMonthByYear]);
  useEffect(() => {
    incomeTrendScrubMonthByYearRef.current = incomeTrendScrubMonthByYear;
  }, [incomeTrendScrubMonthByYear]);
  useEffect(() => {
    assetHistoryScrubMonthByYearRef.current = assetHistoryScrubMonthByYear;
  }, [assetHistoryScrubMonthByYear]);
  useEffect(() => {
    unlockChartScrub();
  }, [selectedInsightType, unlockChartScrub]);
  useEffect(() => () => unlockChartScrub(), [unlockChartScrub]);

  useEffect(() => {
    if (selectedInsightType !== 'calendar_view') return;
    if (currentPage.kind !== 'calendar') return;
    setSelectedCalendarDayKey((previous) => {
      if (
        previous &&
        previous >= currentPage.rangeStartDayKey &&
        previous <= currentPage.rangeEndDayKey
      ) {
        return previous;
      }
      return currentPage.defaultSelectedDayKey;
    });
  }, [currentPage, selectedInsightType]);

  useEffect(() => {
    if (selectedInsightType !== 'calendar_view') return;
    calendarDetailAnimRef.current.setValue(0.68);
    RNAnimated.timing(calendarDetailAnimRef.current, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [currentCalendarDefaultDayKey, selectedCalendarDayKey, selectedInsightType]);

  const setActiveBreakdownSlice = useCallback((nextId: string | null, withHaptic = false) => {
    if (activeBreakdownSliceIdRef.current === nextId) return;
    activeBreakdownSliceIdRef.current = nextId;
    setActiveBreakdownSliceId(nextId);
    if (withHaptic && nextId) {
      void triggerHaptic('selection');
    }
  }, []);

  const renderBreakdownPane = (pageData: BreakdownPageData) => {
    const isIncomeBreakdown = pageData.transactionType === 'income';
    const noPositiveSlicesMessage = isIncomeBreakdown
      ? I18n.t('insights.no_positive_income_slices')
      : I18n.t('insights.no_positive_slices');
    const totalLabel = isIncomeBreakdown
      ? I18n.t('insights.total_income')
      : I18n.t('insights.total_expense');
    const breakdownVisual = isIncomeBreakdown
      ? INSIGHT_TYPE_VISUALS.income_breakdown
      : INSIGHT_TYPE_VISUALS.expense_breakdown;
    const totalRowAccentColor = breakdownVisual.tint;
    const totalRowStyle = {
      backgroundColor: withColorAlpha(totalRowAccentColor, isDark ? 0.18 : 0.1),
      borderColor: withColorAlpha(totalRowAccentColor, isDark ? 0.4 : 0.24),
    } as const;
    const normalizedRows: typeof pageData.categoryRows = [];
    let pageTotalAmount = 0;
    pageData.categoryRows.forEach((row) => {
      if (!Number.isFinite(row.amount) || row.amount <= 0) return;
      normalizedRows.push(row);
      pageTotalAmount += row.amount;
    });
    const pagePieData = normalizedRows.map((row, i) => ({
      id: row.id,
      name: row.label,
      amount: row.amount,
      emoji: row.emoji || categoryById.get(row.id)?.icon || '•',
      pct: pageTotalAmount > 0 ? (row.amount / pageTotalAmount) * 100 : 0,
      color: INSIGHTS_CHART_COLORS[i % INSIGHTS_CHART_COLORS.length],
      legendFontColor: themeColors.textSoft,
      legendFontSize: 11,
    }));
    const activeSlice = activeBreakdownSliceId
      ? (pagePieData.find((item) => item.id === activeBreakdownSliceId) ?? null)
      : null;
    const interactivePieData = activeSlice
      ? pagePieData.map((item) => ({
          ...item,
          color: item.id === activeSlice.id ? item.color : withColorAlpha(item.color, 0.28),
        }))
      : pagePieData;
    const pieFramePadding = 30;
    const pieFrameSize = pieSize + pieFramePadding * 2;
    const selectSliceByTouch = (x: number, y: number, withHaptic = false) => {
      const nextId = pieSliceIdFromTouch({ x, y }, pagePieData, pageTotalAmount, pieSize);
      setActiveBreakdownSlice(nextId, withHaptic);
      return nextId;
    };
    let startAngle = -Math.PI / 2;
    const pagePieLabels =
      pageTotalAmount <= 0
        ? []
        : pagePieData.map((item) => {
            const sliceAngle = (item.amount / pageTotalAmount) * Math.PI * 2;
            const midAngle = startAngle + sliceAngle / 2;
            startAngle += sliceAngle;
            const radius = pieSize / 2 + 22;
            const x = pieSize / 2 + Math.cos(midAngle) * radius;
            const y = pieSize / 2 + Math.sin(midAngle) * radius;
            return { id: item.id, pct: item.pct, x, y, emoji: item.emoji };
          });
    if (pageData.filteredForRange.length === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.empty.title')}
          message={I18n.t('insights.empty.message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    return (
      <Card className="mt-2">
        <CardContent className="py-3 gap-1.5">
          <>
            <View className="items-center py-0.5">
              {pagePieData.length > 0 ? (
                <View style={[styles.pieFrame, buildSizeStyle(pieFrameSize, pieFrameSize)]}>
                  <View style={[styles.pieFrame, buildSizeStyle(pieSize, pieSize)]}>
                    <PieChart
                      data={interactivePieData}
                      width={pieSize}
                      height={pieSize}
                      center={[pieSize / 4, 0]}
                      chartConfig={chartConfig}
                      accessor="amount"
                      backgroundColor="transparent"
                      paddingLeft="0"
                      hasLegend={false}
                      absolute={false}
                    />
                  </View>
                  {pagePieLabels.map((label) => (
                    <View
                      key={label.id}
                      style={[styles.pieLabel, { left: label.x + 16, top: label.y + 16 }]}
                      className={cn(
                        'px-2 py-1 rounded-full bg-card border',
                        activeSlice && activeSlice.id !== label.id
                          ? 'border-border/20 opacity-55'
                          : 'border-border/35',
                      )}
                    >
                      <Text variant="label">
                        {label.emoji} {label.pct.toFixed(0)}%
                      </Text>
                    </View>
                  ))}
                  <View
                    className="absolute inset-0"
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(event) => {
                      const { locationX, locationY } = event.nativeEvent;
                      pieTouchStartRef.current = { x: locationX, y: locationY, moved: false };
                      selectSliceByTouch(
                        locationX - pieFramePadding,
                        locationY - pieFramePadding,
                        true,
                      );
                    }}
                    onResponderMove={(event) => {
                      const { locationX, locationY } = event.nativeEvent;
                      const start = pieTouchStartRef.current;
                      if (start) {
                        const movedDistance = Math.hypot(locationX - start.x, locationY - start.y);
                        if (movedDistance > 8) {
                          start.moved = true;
                        }
                      }
                      selectSliceByTouch(
                        locationX - pieFramePadding,
                        locationY - pieFramePadding,
                        true,
                      );
                    }}
                    onResponderRelease={(event) => {
                      const { locationX, locationY } = event.nativeEvent;
                      const nextId = selectSliceByTouch(
                        locationX - pieFramePadding,
                        locationY - pieFramePadding,
                        false,
                      );
                      const start = pieTouchStartRef.current;
                      const isTap = !start?.moved;
                      if (isTap && nextId) {
                        setActiveBreakdownSlice(nextId, true);
                      }
                      if (isTap && !nextId) {
                        setActiveBreakdownSlice(null, false);
                      }
                      pieTouchStartRef.current = null;
                    }}
                    onResponderTerminate={() => {
                      pieTouchStartRef.current = null;
                    }}
                  />
                </View>
              ) : (
                <View className="rounded-[16px] bg-secondary/45 border border-border/30 px-4 py-3">
                  <Text variant="label" tone="muted">
                    {noPositiveSlicesMessage}
                  </Text>
                </View>
              )}
            </View>

            <View className="gap-1 mt-0">
              <View
                className="relative overflow-hidden rounded-xl border px-3 py-2 flex-row items-center justify-between"
                style={totalRowStyle}
              >
                <View
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: totalRowAccentColor }}
                />
                <View className="flex-row items-center gap-2 pl-2">
                  <View
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: totalRowAccentColor }}
                  />
                  <Text variant="label" className="text-foreground/80">
                    {totalLabel}
                  </Text>
                </View>
                {renderValueNode(pageTotalAmount, {
                  variant: 'caption',
                  textClassName:
                    'text-[15px] leading-[18px] font-black tracking-tight text-foreground',
                  iconColor: totalRowAccentColor,
                  iconSize: 14,
                })}
              </View>
              {pagePieData.map((item) => {
                const isSelected = activeBreakdownSliceId === item.id;
                const hasSelection = activeBreakdownSliceId !== null;
                const pctRatio = Math.min(1, Math.max(0, item.pct / 100));
                const rowBackgroundColor = isSelected
                  ? withColorAlpha(item.color, 0.28)
                  : hasSelection
                    ? withColorAlpha(item.color, 0.04)
                    : withColorAlpha(item.color, 0.07 + pctRatio * 0.22);
                const rowBorderColor = isSelected
                  ? withColorAlpha(item.color, 0.7)
                  : hasSelection
                    ? withColorAlpha(item.color, 0.1)
                    : withColorAlpha(item.color, 0.2 + pctRatio * 0.32);
                const percentBadgeColor = isSelected
                  ? withColorAlpha(item.color, 0.38)
                  : withColorAlpha(item.color, 0.24);

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setActiveBreakdownSlice(null, false);
                      const rowTransactions = pageData.breakdownTransactionsById.get(item.id) ?? [];
                      const rootCategory = categoryById.get(item.id) ?? null;
                      openDrilldown({
                        label: item.name,
                        transactions: rowTransactions,
                        categoryRootId: rootCategory?.id,
                        categoryRootLabel: rootCategory?.name ?? item.name,
                        categoryRootEmoji: rootCategory?.icon ?? item.emoji,
                        categoryRootColor: item.color,
                        triggerSelectionHaptic: true,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.emoji} ${item.name}`}
                    className="rounded-xl px-2.5 py-1.5 active:opacity-85 border"
                    style={[
                      { backgroundColor: rowBackgroundColor, borderColor: rowBorderColor },
                      isSelected && { borderWidth: 2 },
                      hasSelection && !isSelected && { opacity: 0.5 },
                    ]}
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <Text variant="caption" className="flex-1 pr-2" numberOfLines={2}>
                        {item.emoji} {item.name}
                      </Text>
                      <View className="flex-row items-center gap-1.5">
                        {renderValueNode(item.amount, {
                          variant: 'label',
                          textClassName: 'text-foreground',
                          iconColor: themeColors.text,
                        })}
                        <View
                          className="rounded-full px-1.5 py-0.5"
                          style={[
                            styles.breakdownPercentBadge,
                            { backgroundColor: percentBadgeColor },
                          ]}
                        >
                          <Text variant="label" className="text-foreground">
                            {item.pct.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        </CardContent>
      </Card>
    );
  };

  const renderCalendarPane = (pageData: CalendarPageData) => {
    if (pageData.filteredForRange.length === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.empty.title')}
          message={I18n.t('insights.empty.message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const todayDayKey = dayKeyFromDateLocal(new Date());
    const fallbackDayKey = pageData.defaultSelectedDayKey;
    const selectedDayKey =
      selectedCalendarDayKey &&
      selectedCalendarDayKey >= pageData.rangeStartDayKey &&
      selectedCalendarDayKey <= pageData.rangeEndDayKey
        ? selectedCalendarDayKey
        : fallbackDayKey;
    const selectedDayData = pageData.dailyTotalsByDayKey.get(selectedDayKey) ?? {
      dayKey: selectedDayKey,
      income: 0,
      expense: 0,
      net: 0,
      transactions: [],
    };
    const selectedDayTransactions = selectedDayData.transactions;
    const selectedDayLabel = formatCalendarDate(selectedDayKey, activeLocale);
    const isFutureDay = selectedDayKey > todayDayKey;
    const dayCellGap = 5;
    const dayCellSize = Math.max(40, Math.floor((chartWidth - dayCellGap * 6) / 7));
    const dayCellHeight = dayCellSize + 12;
    const calendarGridWidth = dayCellSize * 7 + dayCellGap * 6;
    const dayDetailScale = calendarDetailAnimRef.current.interpolate({
      inputRange: [0.68, 1],
      outputRange: [0.985, 1],
    });
    const dayDetailAnimatedStyle = {
      opacity: calendarDetailAnimRef.current,
      transform: [{ scale: dayDetailScale }],
    };

    return (
      <View className="mt-2 gap-3">
        <View className="gap-2.5">
          {pageData.monthSections.map((month) => (
            <Card key={month.monthKey} className="items-center py-5">
              <View style={{ width: calendarGridWidth }}>
                <View className="flex-row mb-1.5" style={{ gap: dayCellGap }}>
                  {calendarWeekdayLabels.map((weekday) => (
                    <View
                      key={`${month.monthKey}-${weekday}`}
                      style={[styles.calendarWeekdayCell, buildWidthStyle(dayCellSize)]}
                    >
                      <Text variant="label" tone="muted">
                        {weekday}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.calendarGrid, { gap: dayCellGap }]}>
                  {month.cells.map((cell) => {
                    if (cell.kind === 'spacer') {
                      return (
                        <View key={cell.id} style={buildSizeStyle(dayCellSize, dayCellHeight)} />
                      );
                    }

                    const isSelected = cell.dayKey === selectedDayKey;
                    const hasActivity = cell.transactionCount > 0;
                    const inactiveOpacity = cell.isOutsideRange ? 0.28 : 1;
                    const baseIntensity =
                      cell.expenseDotTier > 0 ? (cell.expenseDotTier - 1) / 4 : 0;
                    const toneColor = themeColors.error;
                    const dotSizeByTier = [3, 4, 5, 6, 7] as const;
                    const dotSize =
                      cell.expenseDotTier > 0 ? dotSizeByTier[cell.expenseDotTier - 1] : 0;
                    const bgColor = isSelected
                      ? withColorAlpha(themeColors.primary, 0.24)
                      : hasActivity
                        ? withColorAlpha(toneColor, 0.08 + baseIntensity * 0.24)
                        : cell.isFuture
                          ? withColorAlpha(themeColors.sky, 0.08)
                          : withColorAlpha(themeColors.surfaceMuted, 0.6);
                    const borderColor = isSelected
                      ? withColorAlpha(themeColors.primary, 0.9)
                      : hasActivity
                        ? withColorAlpha(toneColor, 0.2 + baseIntensity * 0.3)
                        : withColorAlpha(themeColors.textMuted, 0.18);

                    return (
                      <Pressable
                        key={cell.id}
                        disabled={cell.isOutsideRange}
                        onPress={() => {
                          if (cell.isOutsideRange) return;
                          void triggerHaptic('selection');
                          setSelectedCalendarDayKey(cell.dayKey);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={formatCalendarDate(cell.dayKey, activeLocale)}
                        accessibilityState={{ selected: isSelected, disabled: cell.isOutsideRange }}
                        className={cn('rounded-xl items-center border active:opacity-85')}
                        style={[
                          styles.calendarDayCell,
                          {
                            width: dayCellSize,
                            height: dayCellHeight,
                            backgroundColor: bgColor,
                            borderColor,
                            borderWidth: isSelected ? 2 : 1,
                            opacity: inactiveOpacity,
                          },
                        ]}
                      >
                        <Text
                          variant="caption"
                          className={cn(
                            isSelected
                              ? 'text-primary font-bold'
                              : hasActivity
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                          )}
                        >
                          {cell.dayNumber}
                        </Text>
                        {hasActivity ? (
                          cell.topCategoryEmoji ? (
                            <View
                              style={[
                                styles.calendarEmojiCircle,
                                {
                                  backgroundColor: isSelected
                                    ? withColorAlpha(themeColors.primary, 0.18)
                                    : withColorAlpha(toneColor, 0.12 + baseIntensity * 0.12),
                                },
                              ]}
                            >
                              <RNText allowFontScaling={false} style={styles.calendarEmojiLabel}>
                                {cell.topCategoryEmoji}
                              </RNText>
                            </View>
                          ) : dotSize > 0 ? (
                            <View
                              style={[
                                styles.calendarActivityDot,
                                { width: dotSize, height: dotSize, backgroundColor: toneColor },
                              ]}
                            />
                          ) : null
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Card>
          ))}
        </View>

        <RNAnimated.View style={dayDetailAnimatedStyle}>
          <Card className="p-4">
            <Pressable
              disabled={selectedDayTransactions.length === 0}
              onPress={() => {
                const targetDayKey = selectedDayKey;
                openDrilldown({
                  label: selectedDayLabel,
                  transactions: selectedDayTransactions,
                  triggerSelectionHaptic: true,
                  scopeMatcher: (transaction) =>
                    transaction.type === 'expense' &&
                    (transactionDayKeyById.get(transaction.id) ??
                      dayKeyFromIsoLocal(transaction.date)) === targetDayKey,
                });
              }}
              className="flex-row items-center justify-between active:opacity-80"
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{
                      backgroundColor: withColorAlpha(themeColors.error, isDark ? 0.2 : 0.12),
                    }}
                  >
                    <Text variant="label" style={{ color: themeColors.error, fontWeight: '600' }}>
                      {selectedDayLabel}
                    </Text>
                  </View>
                  <Text variant="label" tone="muted">
                    {isFutureDay
                      ? I18n.t('insights.calendar.future_day')
                      : `${selectedDayTransactions.length} ${I18n.t('insights.calendar.transactions').toLowerCase()}`}
                  </Text>
                </View>

                <View className="mt-1.5">
                  {renderValueNode(selectedDayData.expense, {
                    variant: 'heading',
                    textClassName: 'text-destructive',
                    iconColor: themeColors.error,
                  })}
                </View>
              </View>
              {selectedDayTransactions.length > 0 ? (
                <ChevronRight size={16} color={themeColors.textMuted} />
              ) : null}
            </Pressable>
          </Card>
        </RNAnimated.View>
      </View>
    );
  };

  const renderTimeCostPane = (pageData: TimeCostPageData) => {
    if (pageData.filteredForRange.length === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.empty.title')}
          message={I18n.t('insights.empty.message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    if (!pageData.hasTimeContext) {
      return (
        <EmptyState
          title={I18n.t('insights.time_cost.empty_no_context.title')}
          message={I18n.t('insights.time_cost.empty_no_context.message')}
          mascotMood="thinking"
          animateIn={false}
        />
      );
    }

    if (
      pageData.totalHours <= 0 ||
      (pageData.categoryRows.length === 0 && pageData.transactionRows.length === 0)
    ) {
      return (
        <EmptyState
          title={I18n.t('insights.time_cost.empty_no_rankings.title')}
          message={I18n.t('insights.time_cost.empty_no_rankings.message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const impactRows: RankedImpactRow[] =
      timeCostViewMode === 'category'
        ? pageData.categoryRows.map((categoryRow, index) => {
            const accentColor = TIME_COST_RANK_ACCENTS[index % TIME_COST_RANK_ACCENTS.length];
            return {
              id: categoryRow.id,
              rank: index + 1,
              title: categoryRow.label,
              primaryValue: (
                <TimeValueInline
                  value={formatHours(categoryRow.hours)}
                  variant="caption"
                  iconColor={accentColor}
                  textClassName="text-foreground"
                />
              ),
              secondaryValue: renderMoneyAmount(categoryRow.amount),
              sharePct: categoryRow.sharePct,
              emoji: categoryRow.emoji,
              accentColor,
              onPress: () => {
                const targetCategoryId = categoryRow.id;
                const rootCategory = categoryById.get(targetCategoryId) ?? null;
                openDrilldown({
                  label: `${categoryRow.emoji} ${categoryRow.label}`,
                  transactions: categoryRow.transactions,
                  categoryRootId: rootCategory?.id,
                  categoryRootLabel: rootCategory?.name ?? categoryRow.label,
                  categoryRootEmoji: rootCategory?.icon ?? categoryRow.emoji,
                  categoryRootColor: accentColor,
                  scopeMatcher: (transaction) => {
                    if (transaction.type !== 'expense') return false;
                    const cat = transaction.categoryId
                      ? categoryById.get(transaction.categoryId)
                      : null;
                    const rootId = cat?.parentId ?? transaction.categoryId ?? null;
                    return (
                      rootId === targetCategoryId || transaction.categoryId === targetCategoryId
                    );
                  },
                });
              },
            };
          })
        : pageData.transactionRows.map((transactionRow, index) => {
            const accentColor = TIME_COST_RANK_ACCENTS[index % TIME_COST_RANK_ACCENTS.length];
            return {
              id: transactionRow.id,
              rank: index + 1,
              title: transactionRow.label,
              subtitle: transactionRow.subtitle,
              primaryValue: (
                <TimeValueInline
                  value={formatHours(transactionRow.hours)}
                  variant="caption"
                  iconColor={accentColor}
                  textClassName="text-foreground"
                />
              ),
              secondaryValue: renderMoneyAmount(transactionRow.amount),
              sharePct: transactionRow.sharePct,
              accentColor,
              onPress: () => {
                onOpenTransaction(transactionRow.transaction);
              },
            };
          });

    return (
      <View className="mt-2 gap-3">
        <Card className="p-4">
          <View className="flex-row items-stretch">
            <View className="flex-1">
              <Text variant="label" tone="muted">
                {I18n.t('insights.time_cost.total_hours')}
              </Text>
              <TimeValueInline
                value={formatHours(pageData.totalHours)}
                variant="subheading"
                containerClassName="mt-1"
                textClassName="text-primary"
                iconColor={themeColors.primary}
              />
            </View>
            <View className="mx-3 w-px bg-border/40" />
            <View className="flex-1">
              <Text variant="label" tone="muted">
                {I18n.t('insights.time_cost.money_equivalent')}
              </Text>
              <Text variant="subheading" className="text-foreground mt-1">
                {renderMoneyAmount(pageData.totalAmount)}
              </Text>
            </View>
          </View>
        </Card>

        <View className="flex-row items-center gap-2">
          <FilterPill
            label={I18n.t('insights.time_cost.views.category')}
            active={timeCostViewMode === 'category'}
            onPress={() => setTimeCostViewMode('category')}
          />
          <FilterPill
            label={I18n.t('insights.time_cost.views.transaction')}
            active={timeCostViewMode === 'transaction'}
            onPress={() => setTimeCostViewMode('transaction')}
          />
        </View>

        <RankedImpactChart
          rows={impactRows}
          accentColor={TIME_COST_RANK_ACCENTS[0]}
          shareLabel={null}
        />
      </View>
    );
  };

  const renderExpenseTrendPane = (pageData: ExpenseTrendPageData) => {
    if (pageData.filteredForRange.length === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.analytics.expense_trend.no_data_title')}
          message={I18n.t('insights.analytics.expense_trend.no_data_message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const trendAccentColor = INSIGHT_TYPE_VISUALS.expense_trend.tint;
    const selectedYearKey = pageData.periodKey;
    const selectedMonthKey = expenseTrendScrubMonthByYear[selectedYearKey] ?? null;
    const fallbackSelectedMonthRow =
      [...pageData.monthRows].reverse().find((row) => row.totalExpense > 0) ??
      pageData.monthRows[pageData.monthRows.length - 1] ??
      null;
    const selectedMonthRow =
      pageData.monthRows.find((row) => row.monthKey === selectedMonthKey) ??
      fallbackSelectedMonthRow;
    if (!selectedMonthRow) return null;

    const peakMonthRow =
      pageData.monthRows.find((row) => row.monthKey === pageData.peakMonthKey) ?? null;
    const monthValues = pageData.monthRows.map((row) => row.totalExpense);
    const expenseGraphWidth = Math.max(140, lineChartWidth - EXPENSE_TREND_CHART_PADDING_RIGHT);
    const expenseAxisTicks = buildGraphAxisTicks(monthValues, EXPENSE_TREND_CHART_HEIGHT);
    const selectedMonthValue = selectedMonthRow.totalExpense;
    const selectedMonthAbsoluteValue = Math.abs(selectedMonthValue);
    const selectedMonthDisplayValue = selectedMonthAbsoluteValue.toFixed(2);
    const toneStyle = { color: trendAccentColor };
    const hasDrilldown = selectedMonthRow.transactions.length > 0;
    const metricDividerStyle = {
      backgroundColor: withColorAlpha(themeColors.border, isDark ? 0.4 : 0.3),
    };
    const selectExpenseTrendMonth = (monthKey: string) => {
      if (expenseTrendScrubMonthByYearRef.current[selectedYearKey] === monthKey) return;
      triggerScrubHaptic();
      expenseTrendScrubMonthByYearRef.current = {
        ...expenseTrendScrubMonthByYearRef.current,
        [selectedYearKey]: monthKey,
      };
      setExpenseTrendScrubMonthByYear((previous) => {
        if (previous[selectedYearKey] === monthKey) return previous;
        return { ...previous, [selectedYearKey]: monthKey };
      });
    };

    return (
      <View className="mt-2 gap-3">
        <View style={lineChartSectionStyle} className="py-1">
          <View
            style={[
              styles.chartSizeCenter,
              buildSizeStyle(lineChartWidth, EXPENSE_TREND_CHART_HEIGHT),
            ]}
            onTouchStart={lockChartScrub}
            onTouchEnd={unlockChartScrub}
            onTouchCancel={unlockChartScrub}
          >
            <GraphYAxisGrid
              ticks={expenseAxisTicks}
              chartWidth={expenseGraphWidth}
              chartHeight={EXPENSE_TREND_CHART_HEIGHT}
              labelWidth={EXPENSE_TREND_CHART_PADDING_RIGHT}
              lineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
              formatTick={formatAxisAssetValue}
            />
            <TrendBarChart
              data={pageData.monthRows.map((row) => ({
                monthKey: row.monthKey,
                value: row.totalExpense,
                label: row.axisLabel,
                subLabel: row.axisSubLabel ?? undefined,
              }))}
              chartWidth={expenseGraphWidth}
              chartHeight={EXPENSE_TREND_CHART_HEIGHT}
              primaryColor={trendAccentColor}
              averageValue={pageData.averageMonthExpense}
              referenceColor={themeColors.error}
              selectedMonthKey={selectedMonthRow.monthKey}
              onSelectMonthKey={selectExpenseTrendMonth}
              onGestureStart={lockChartScrub}
              onGestureEnd={unlockChartScrub}
              labelColor={themeColors.textMuted}
              gridLineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
            />
          </View>
        </View>

        <Card className="gap-3 p-4">
          <Pressable
            disabled={!hasDrilldown}
            onPress={() =>
              openDrilldown({
                label: selectedMonthRow.label,
                transactions: selectedMonthRow.transactions,
                triggerSelectionHaptic: true,
              })
            }
            className="flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{ backgroundColor: withColorAlpha(trendAccentColor, isDark ? 0.2 : 0.12) }}
                >
                  <Text variant="label" style={{ color: trendAccentColor, fontWeight: '600' }}>
                    {selectedMonthRow.label}
                  </Text>
                </View>
                <Text variant="label" tone="muted">
                  {I18n.t('insights.analytics.expense_trend.transactions', {
                    count: selectedMonthRow.transactionCount,
                  })}
                </Text>
              </View>

              <View className="mt-1.5 flex-row items-center">
                {settings.displayMode === 'time' ? (
                  <TimeValueInline
                    value={formatHours(selectedMonthAbsoluteValue)}
                    variant="heading"
                    iconColor={trendAccentColor}
                    style={toneStyle}
                  />
                ) : (
                  <>
                    <Text variant="heading" style={toneStyle}>
                      {settings.currencySymbol}
                    </Text>
                    <ScrubRollingNumber
                      value={selectedMonthAbsoluteValue}
                      formattedText={selectedMonthDisplayValue}
                      color={trendAccentColor}
                      resetKey={`expense-trend-${selectedYearKey}`}
                      containerClassName="ml-1"
                    />
                  </>
                )}
              </View>

              <View className="mt-1 flex-row items-center gap-1.5">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.analytics.expense_trend.top_category_title')}:
                </Text>
                {selectedMonthRow.topCategoryLabel ? (
                  <>
                    <Text variant="label" style={{ color: trendAccentColor }}>
                      {`${selectedMonthRow.topCategoryEmoji ?? '•'} ${selectedMonthRow.topCategoryLabel}`}
                    </Text>
                    {renderCompactValueNode(selectedMonthRow.topCategoryAmount, {
                      variant: 'label',
                      style: toneStyle,
                      containerClassName: 'ml-0.5',
                    })}
                  </>
                ) : (
                  <Text variant="label" tone="muted">
                    —
                  </Text>
                )}
              </View>
            </View>
            {hasDrilldown ? <ChevronRight size={16} color={themeColors.textMuted} /> : null}
          </Pressable>

          <View className="flex-row items-stretch border-t border-border/40 pt-3">
            <View className="flex-1">
              <Text variant="label" tone="muted">
                {I18n.t(
                  pageData.granularity === 'day'
                    ? 'insights.analytics.expense_trend.peak_title_day'
                    : 'insights.analytics.expense_trend.peak_title',
                )}
              </Text>
              <View className="mt-1">
                {peakMonthRow ? (
                  renderValueNode(peakMonthRow.totalExpense, {
                    variant: 'subheading',
                    textClassName: 'text-foreground',
                    iconColor: themeColors.text,
                  })
                ) : (
                  <Text variant="subheading" className="text-foreground">
                    —
                  </Text>
                )}
              </View>
              <Text variant="label" tone="muted" className="mt-0.5">
                {peakMonthRow?.label ?? '—'}
              </Text>
            </View>
            <View className="mx-3 w-px" style={metricDividerStyle} />
            <View className="flex-1">
              <Text variant="label" tone="muted">
                {I18n.t(
                  pageData.granularity === 'day'
                    ? 'insights.analytics.expense_trend.average_title_day'
                    : 'insights.analytics.expense_trend.average_title',
                )}
              </Text>
              <View className="mt-1">
                {renderValueNode(pageData.averageMonthExpense, {
                  variant: 'subheading',
                  textClassName: 'text-foreground',
                  iconColor: themeColors.text,
                })}
              </View>
              <Text variant="label" tone="muted" className="mt-0.5">
                {I18n.t(
                  pageData.granularity === 'day'
                    ? 'insights.analytics.expense_trend.active_days'
                    : 'insights.analytics.expense_trend.active_months',
                  {
                    count: pageData.activeMonths,
                  },
                )}
              </Text>
            </View>
          </View>
        </Card>
      </View>
    );
  };

  const renderIncomeTrendPane = (pageData: IncomeTrendPageData) => {
    if (pageData.filteredForRange.length === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.analytics.income_trend.no_data_title')}
          message={I18n.t('insights.analytics.income_trend.no_data_message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const trendAccentColor = INSIGHT_TYPE_VISUALS.income_trend.tint;
    const selectedYearKey = pageData.periodKey;
    const selectedMonthKey = incomeTrendScrubMonthByYear[selectedYearKey] ?? null;
    const fallbackSelectedMonthRow =
      [...pageData.monthRows].reverse().find((row) => row.totalIncome > 0) ??
      pageData.monthRows[pageData.monthRows.length - 1] ??
      null;
    const selectedMonthRow =
      pageData.monthRows.find((row) => row.monthKey === selectedMonthKey) ??
      fallbackSelectedMonthRow;
    if (!selectedMonthRow) return null;

    const peakMonthRow =
      pageData.monthRows.find((row) => row.monthKey === pageData.peakMonthKey) ?? null;
    const monthValues = pageData.monthRows.map((row) => row.totalIncome);
    const incomeGraphWidth = Math.max(140, lineChartWidth - EXPENSE_TREND_CHART_PADDING_RIGHT);
    const incomeAxisTicks = buildGraphAxisTicks(monthValues, EXPENSE_TREND_CHART_HEIGHT);
    const selectedMonthValue = selectedMonthRow.totalIncome;
    const selectedMonthAbsoluteValue = Math.abs(selectedMonthValue);
    const selectedMonthDisplayValue = selectedMonthAbsoluteValue.toFixed(2);
    const toneStyle = { color: trendAccentColor };
    const hasDrilldown = selectedMonthRow.transactions.length > 0;
    const metricDividerStyle = {
      backgroundColor: withColorAlpha(themeColors.border, isDark ? 0.4 : 0.3),
    };
    const selectIncomeTrendMonth = (monthKey: string) => {
      if (incomeTrendScrubMonthByYearRef.current[selectedYearKey] === monthKey) return;
      triggerScrubHaptic();
      incomeTrendScrubMonthByYearRef.current = {
        ...incomeTrendScrubMonthByYearRef.current,
        [selectedYearKey]: monthKey,
      };
      setIncomeTrendScrubMonthByYear((previous) => {
        if (previous[selectedYearKey] === monthKey) return previous;
        return { ...previous, [selectedYearKey]: monthKey };
      });
    };

    return (
      <View className="mt-2 gap-3">
        <View style={lineChartSectionStyle} className="py-1">
          <View
            style={[
              styles.chartSizeCenter,
              buildSizeStyle(lineChartWidth, EXPENSE_TREND_CHART_HEIGHT),
            ]}
            onTouchStart={lockChartScrub}
            onTouchEnd={unlockChartScrub}
            onTouchCancel={unlockChartScrub}
          >
            <GraphYAxisGrid
              ticks={incomeAxisTicks}
              chartWidth={incomeGraphWidth}
              chartHeight={EXPENSE_TREND_CHART_HEIGHT}
              labelWidth={EXPENSE_TREND_CHART_PADDING_RIGHT}
              lineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
              formatTick={formatAxisAssetValue}
            />
            <TrendBarChart
              data={pageData.monthRows.map((row) => ({
                monthKey: row.monthKey,
                value: row.totalIncome,
                label: row.axisLabel,
                subLabel: row.axisSubLabel ?? undefined,
              }))}
              chartWidth={incomeGraphWidth}
              chartHeight={EXPENSE_TREND_CHART_HEIGHT}
              primaryColor={trendAccentColor}
              averageValue={pageData.averageMonthIncome}
              referenceColor={themeColors.success}
              selectedMonthKey={selectedMonthRow.monthKey}
              onSelectMonthKey={selectIncomeTrendMonth}
              onGestureStart={lockChartScrub}
              onGestureEnd={unlockChartScrub}
              labelColor={themeColors.textMuted}
              gridLineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
            />
          </View>
        </View>

        <Card className="gap-3 p-4">
          <Pressable
            disabled={!hasDrilldown}
            onPress={() =>
              openDrilldown({
                label: selectedMonthRow.label,
                transactions: selectedMonthRow.transactions,
                triggerSelectionHaptic: true,
              })
            }
            className="flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{ backgroundColor: withColorAlpha(trendAccentColor, isDark ? 0.2 : 0.12) }}
                >
                  <Text variant="label" style={{ color: trendAccentColor, fontWeight: '600' }}>
                    {selectedMonthRow.label}
                  </Text>
                </View>
                <Text variant="label" tone="muted">
                  {I18n.t('insights.analytics.income_trend.transactions', {
                    count: selectedMonthRow.transactionCount,
                  })}
                </Text>
              </View>

              <View className="mt-1.5 flex-row items-center">
                {settings.displayMode === 'time' ? (
                  <TimeValueInline
                    value={formatHours(selectedMonthAbsoluteValue)}
                    variant="heading"
                    iconColor={trendAccentColor}
                    style={toneStyle}
                  />
                ) : (
                  <>
                    <Text variant="heading" style={toneStyle}>
                      {settings.currencySymbol}
                    </Text>
                    <ScrubRollingNumber
                      value={selectedMonthAbsoluteValue}
                      formattedText={selectedMonthDisplayValue}
                      color={trendAccentColor}
                      resetKey={`income-trend-${selectedYearKey}`}
                      containerClassName="ml-1"
                    />
                  </>
                )}
              </View>

              <View className="mt-1 flex-row items-center gap-1.5">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.analytics.income_trend.top_category_title')}:
                </Text>
                {selectedMonthRow.topCategoryLabel ? (
                  <>
                    <Text variant="label" style={{ color: trendAccentColor }}>
                      {`${selectedMonthRow.topCategoryEmoji ?? '•'} ${selectedMonthRow.topCategoryLabel}`}
                    </Text>
                    {renderCompactValueNode(selectedMonthRow.topCategoryAmount, {
                      variant: 'label',
                      style: toneStyle,
                      containerClassName: 'ml-0.5',
                    })}
                  </>
                ) : (
                  <Text variant="label" tone="muted">
                    —
                  </Text>
                )}
              </View>
            </View>
            {hasDrilldown ? <ChevronRight size={16} color={themeColors.textMuted} /> : null}
          </Pressable>

          <View className="flex-row items-stretch border-t border-border/40 pt-3">
            <View className="flex-1">
              <Text variant="label" tone="muted">
                {I18n.t(
                  pageData.granularity === 'day'
                    ? 'insights.analytics.income_trend.peak_title_day'
                    : 'insights.analytics.income_trend.peak_title',
                )}
              </Text>
              <View className="mt-1">
                {peakMonthRow ? (
                  renderValueNode(peakMonthRow.totalIncome, {
                    variant: 'subheading',
                    textClassName: 'text-foreground',
                    iconColor: themeColors.text,
                  })
                ) : (
                  <Text variant="subheading" className="text-foreground">
                    —
                  </Text>
                )}
              </View>
              <Text variant="label" tone="muted" className="mt-0.5">
                {peakMonthRow?.label ?? '—'}
              </Text>
            </View>
            <View className="mx-3 w-px" style={metricDividerStyle} />
            <View className="flex-1">
              <Text variant="label" tone="muted">
                {I18n.t(
                  pageData.granularity === 'day'
                    ? 'insights.analytics.income_trend.average_title_day'
                    : 'insights.analytics.income_trend.average_title',
                )}
              </Text>
              <View className="mt-1">
                {renderValueNode(pageData.averageMonthIncome, {
                  variant: 'subheading',
                  textClassName: 'text-foreground',
                  iconColor: themeColors.text,
                })}
              </View>
              <Text variant="label" tone="muted" className="mt-0.5">
                {I18n.t(
                  pageData.granularity === 'day'
                    ? 'insights.analytics.income_trend.active_days'
                    : 'insights.analytics.income_trend.active_months',
                  {
                    count: pageData.activeMonths,
                  },
                )}
              </Text>
            </View>
          </View>
        </Card>
      </View>
    );
  };

  const renderExpenseSentimentPane = (pageData: ExpenseSentimentPageData) => {
    if (pageData.filteredForRange.length === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.analytics.expense_sentiment.no_data_title')}
          message={I18n.t('insights.analytics.expense_sentiment.no_data_message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const sentimentChartWidth = Math.max(140, lineChartWidth - SENTIMENT_CHART_PADDING_RIGHT);
    return (
      <View className="mt-2 gap-3">
        <View style={lineChartSectionStyle} className="py-1">
          <View
            style={[styles.chartSizeCenter, buildSizeStyle(lineChartWidth, SENTIMENT_CHART_HEIGHT)]}
          >
            <SentimentStackedBarChart
              data={pageData.dayRows}
              chartWidth={sentimentChartWidth}
              chartHeight={SENTIMENT_CHART_HEIGHT}
              labelColor={themeColors.textMuted}
              happyColor={SENTIMENT_COLORS.happy}
              neutralColor={SENTIMENT_COLORS.neutral}
              sadColor={SENTIMENT_COLORS.sad}
            />
          </View>
        </View>

        <Card className="gap-3 p-4">
          <Text variant="label" tone="muted">
            {I18n.t('insights.analytics.expense_sentiment.summary_title')}
          </Text>
          <View className="flex-row items-center pt-1">
            <View className="flex-1 items-center justify-center py-1">
              <View className="flex-row items-center justify-center gap-1.5">
                <SentimentIcon sentiment="sad" size={26} />
                <X size={12} color="#000000" strokeWidth={2.4} />
                <Text variant="subheading" style={{ color: SENTIMENT_COLORS.sad }}>
                  {pageData.totals.sad}
                </Text>
              </View>
            </View>
            <View
              className="mx-3 w-px"
              style={{ backgroundColor: withColorAlpha(themeColors.border, isDark ? 0.4 : 0.3) }}
            />
            <View className="flex-1 items-center justify-center py-1">
              <View className="flex-row items-center justify-center gap-1.5">
                <SentimentIcon sentiment="neutral" size={26} />
                <X size={12} color="#000000" strokeWidth={2.4} />
                <Text variant="subheading" style={{ color: SENTIMENT_COLORS.neutral }}>
                  {pageData.totals.neutral}
                </Text>
              </View>
            </View>
            <View
              className="mx-3 w-px"
              style={{ backgroundColor: withColorAlpha(themeColors.border, isDark ? 0.4 : 0.3) }}
            />
            <View className="flex-1 items-center justify-center py-1">
              <View className="flex-row items-center justify-center gap-1.5">
                <SentimentIcon sentiment="happy" size={26} />
                <X size={12} color="#000000" strokeWidth={2.4} />
                <Text variant="subheading" style={{ color: SENTIMENT_COLORS.happy }}>
                  {pageData.totals.happy}
                </Text>
              </View>
            </View>
          </View>
        </Card>
      </View>
    );
  };

  const renderAssetHistoryPane = (pageData: AssetHistoryPageData) => {
    if (pageData.includedAccountsCount === 0) {
      return (
        <EmptyState
          title={I18n.t('insights.analytics.asset_history.empty_no_accounts.title')}
          message={I18n.t('insights.analytics.asset_history.empty_no_accounts.message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const assetDisplayRows =
      settings.displayMode === 'time'
        ? pageData.monthRows.map((row) => {
            const rate = getTrueHourlyRateForDate(`${row.monthKey}-15T12:00:00`);
            return {
              ...row,
              totalAssets: amountToHoursByRate(row.totalAssets, rate),
            };
          })
        : pageData.monthRows;
    const monthValues = assetDisplayRows.map((row) => row.totalAssets);
    const selectedMonthKey = assetHistoryScrubMonthByYear[String(pageData.year)] ?? null;
    const selectedMonthRow =
      assetDisplayRows.find((row) => row.monthKey === selectedMonthKey) ??
      assetDisplayRows[assetDisplayRows.length - 1] ??
      null;
    const assetGraphWidth = Math.max(140, lineChartWidth - ASSET_HISTORY_CHART_PADDING_RIGHT);
    const assetAxisTicks = buildGraphAxisTicks(monthValues, ASSET_HISTORY_CHART_HEIGHT);
    const selectedAssetValue = selectedMonthRow?.totalAssets ?? 0;
    const selectedAssetAbsoluteValue = Math.abs(selectedAssetValue);
    const selectedAssetDisplayValue = selectedAssetAbsoluteValue.toFixed(2);
    const selectedAssetLabel =
      selectedMonthRow?.label ?? I18n.t('insights.analytics.asset_history.latest');
    const selectedYearKey = String(pageData.year);
    const selectedAssetToneColor =
      selectedAssetValue >= 0 ? themeColors.success : themeColors.error;
    const selectedAssetToneStyle = { color: selectedAssetToneColor };
    const selectedAssetSign = selectedAssetValue < 0 ? '-' : '';
    const selectedAssetCurrencyPrefix = `${selectedAssetSign}${settings.currencySymbol}`;
    const selectedAssetHoursLabel = `${selectedAssetSign}${formatHours(selectedAssetAbsoluteValue)}`;
    const selectAssetHistoryMonth = (monthKey: string) => {
      if (assetHistoryScrubMonthByYearRef.current[selectedYearKey] === monthKey) return;
      triggerScrubHaptic();
      assetHistoryScrubMonthByYearRef.current = {
        ...assetHistoryScrubMonthByYearRef.current,
        [selectedYearKey]: monthKey,
      };
      setAssetHistoryScrubMonthByYear((previous) => {
        if (previous[selectedYearKey] === monthKey) return previous;
        return { ...previous, [selectedYearKey]: monthKey };
      });
    };

    return (
      <View className="mt-2 gap-2.5">
        <View style={lineChartSectionStyle} className="py-1">
          <View
            style={[
              styles.chartSizeCenter,
              buildSizeStyle(lineChartWidth, ASSET_HISTORY_CHART_HEIGHT),
            ]}
            onTouchStart={lockChartScrub}
            onTouchEnd={unlockChartScrub}
            onTouchCancel={unlockChartScrub}
          >
            <GraphYAxisGrid
              ticks={assetAxisTicks}
              chartWidth={assetGraphWidth}
              chartHeight={ASSET_HISTORY_CHART_HEIGHT}
              labelWidth={ASSET_HISTORY_CHART_PADDING_RIGHT}
              lineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
              formatTick={formatAxisAssetValue}
            />
            <AssetHistoryLineChart
              monthRows={assetDisplayRows}
              chartWidth={assetGraphWidth}
              primaryColor={themeColors.primary}
              onSelectMonthKey={selectAssetHistoryMonth}
              onGestureStart={lockChartScrub}
              onGestureEnd={unlockChartScrub}
            />
          </View>
        </View>

        <Card className="p-4">
          <View className="flex-row items-center gap-2">
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: withColorAlpha(themeColors.primary, isDark ? 0.2 : 0.12) }}
            >
              <Text variant="label" style={{ color: themeColors.primary, fontWeight: '600' }}>
                {selectedAssetLabel}
              </Text>
            </View>
          </View>

          <View className="mt-1.5 flex-row items-center">
            {settings.displayMode === 'time' ? (
              <TimeValueInline
                value={selectedAssetHoursLabel}
                variant="heading"
                iconColor={selectedAssetToneColor}
                style={selectedAssetToneStyle}
              />
            ) : (
              <>
                <Text variant="heading" style={selectedAssetToneStyle}>
                  {selectedAssetCurrencyPrefix}
                </Text>
                <ScrubRollingNumber
                  value={selectedAssetAbsoluteValue}
                  formattedText={selectedAssetDisplayValue}
                  color={selectedAssetToneColor}
                  resetKey={`asset-${selectedYearKey}`}
                  containerClassName="ml-1"
                />
              </>
            )}
          </View>
        </Card>
      </View>
    );
  };

  const renderIncomeRateHistoryPane = (pageData: IncomeRateHistoryPageData) => {
    if (pageData.points.length < 2) {
      return (
        <EmptyState
          title={I18n.t('insights.analytics.income_rate_history.no_data_title')}
          message={I18n.t('insights.analytics.income_rate_history.no_data_message')}
          mascotMood="curious"
          animateIn={false}
        />
      );
    }

    const rates = pageData.points.map((point) =>
      convertIncomeRateByUnit(
        point.wageAmount,
        point.wageType,
        point.hoursWorkedPerWeek,
        incomeRateDisplayUnit,
      ),
    );
    const incomeGraphWidth = Math.max(140, lineChartWidth - INCOME_RATE_CHART_PADDING_RIGHT);
    const incomeAxisTicks = buildGraphAxisTicks(rates, INCOME_RATE_CHART_HEIGHT);
    const fallbackIndex = Math.max(0, pageData.points.length - 1);
    const selectedIndex =
      selectedIncomeRatePointIndex !== null && selectedIncomeRatePointIndex < pageData.points.length
        ? selectedIncomeRatePointIndex
        : fallbackIndex;
    const selectedPoint = pageData.points[selectedIndex] ?? null;
    const selectedRate = rates[selectedIndex] ?? rates[fallbackIndex] ?? 0;
    const selectedRateDisplay = selectedRate.toLocaleString(activeLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const selectedRateSuffix = incomeRateUnitSuffix(incomeRateDisplayUnit);
    const selectedRateLabel = selectedPoint?.label ?? '—';
    const incomeRateResetKey = `${pageData.range.start}-${pageData.range.end}-${incomeRateDisplayUnit}`;

    const selectPoint = (index: number) => {
      if (selectedIncomeRatePointIndexRef.current === index) return;
      triggerScrubHaptic();
      selectedIncomeRatePointIndexRef.current = index;
      setSelectedIncomeRatePointIndex(index);
    };

    return (
      <View className="mt-2 gap-2.5">
        <View style={lineChartSectionStyle} className="py-1">
          <View
            style={[
              styles.chartSizeCenter,
              buildSizeStyle(lineChartWidth, INCOME_RATE_CHART_HEIGHT),
            ]}
            onTouchStart={lockChartScrub}
            onTouchEnd={unlockChartScrub}
            onTouchCancel={unlockChartScrub}
          >
            <GraphYAxisGrid
              ticks={incomeAxisTicks}
              chartWidth={incomeGraphWidth}
              chartHeight={INCOME_RATE_CHART_HEIGHT}
              labelWidth={INCOME_RATE_CHART_PADDING_RIGHT}
              lineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
              formatTick={formatAxisCurrencyValue}
            />
            <IncomeRateLineChart
              points={pageData.points}
              rates={rates}
              chartWidth={incomeGraphWidth}
              primaryColor={themeColors.primary}
              onSelectPointIndex={selectPoint}
              onGestureStart={lockChartScrub}
              onGestureEnd={unlockChartScrub}
            />
          </View>
        </View>

        <Card className="p-4">
          <View className="flex-row items-center gap-2">
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: withColorAlpha(themeColors.primary, isDark ? 0.2 : 0.12) }}
            >
              <Text variant="label" style={{ color: themeColors.primary, fontWeight: '600' }}>
                {selectedRateLabel}
              </Text>
            </View>
          </View>
          <View className="mt-1.5 flex-row items-center">
            <Text variant="heading" className="text-primary">
              {settings.currencySymbol}
            </Text>
            <ScrubRollingNumber
              value={selectedRate}
              formattedText={selectedRateDisplay}
              color={themeColors.primary}
              resetKey={`income-rate-${incomeRateResetKey}`}
              containerClassName="ml-1"
            />
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setIsIncomeRateUnitPickerOpen(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('insights.analytics.income_rate_history.rate_title')}
              className="ml-1 flex-row items-center active:opacity-80"
            >
              <Text variant="heading" className="text-primary">
                {selectedRateSuffix}
              </Text>
              <Text variant="label" tone="muted" className="ml-1">
                ▾
              </Text>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  };

  const renderAnalyticsPane = (pageData: AnalyticsPageData) => {
    if (pageData.insightType === 'savings_rate') {
      const savingsRate =
        pageData.totalIncome > 0 ? pageData.totalNet / pageData.totalIncome : null;
      const normalized = savingsRate === null ? 0 : Math.max(0, Math.min(1, Math.abs(savingsRate)));

      const toneClass =
        savingsRate === null
          ? 'text-muted-foreground'
          : savingsRate >= 0.2
            ? 'text-success'
            : savingsRate >= 0
              ? 'text-warning'
              : 'text-destructive';
      const rateBarClass =
        savingsRate === null
          ? 'bg-border'
          : savingsRate >= 0.2
            ? 'bg-success'
            : savingsRate >= 0
              ? 'bg-warning'
              : 'bg-destructive';
      const formattedSavingsRate =
        savingsRate === null
          ? I18n.t('insights.analytics.savings_rate.no_income_short')
          : `${(savingsRate * 100).toFixed(1)}%`;
      const yearlySavedAmount = Math.abs(pageData.totalNet);
      const yearlySavedAmountClass =
        pageData.totalNet > 0
          ? 'text-success'
          : pageData.totalNet < 0
            ? 'text-destructive'
            : 'text-muted-foreground';
      const yearlySavedBadgeClass =
        pageData.totalNet > 0
          ? 'border-success/30 bg-success/10'
          : pageData.totalNet < 0
            ? 'border-destructive/30 bg-destructive/10'
            : 'border-border/35 bg-secondary/20';
      const healthyMarkerLeft = `${Math.round(HEALTHY_SAVINGS_RATE_THRESHOLD * 100)}%` as const;
      const healthyMarkerColor = withColorAlpha(themeColors.text, isDark ? 0.75 : 0.5);

      return (
        <View className="mt-2 gap-3">
          <Card className="gap-3 p-4">
            <View>
              <Text variant="label" tone="muted">
                {I18n.t('insights.analytics.savings_rate.title')}
              </Text>
              <View className="mt-1 flex-row flex-wrap items-center gap-2">
                <Text variant="heading" className={toneClass}>
                  {formattedSavingsRate}
                </Text>
                <View className={cn('rounded-full border px-2 py-[3px]', yearlySavedBadgeClass)}>
                  {renderCompactValueNode(yearlySavedAmount, {
                    variant: 'label',
                    textClassName: cn(yearlySavedAmountClass),
                    iconColor:
                      pageData.totalNet > 0
                        ? themeColors.success
                        : pageData.totalNet < 0
                          ? themeColors.error
                          : themeColors.textMuted,
                  })}
                </View>
              </View>
              <View className="mt-2 h-3 rounded-full bg-secondary overflow-hidden">
                <View
                  className={cn('h-full rounded-full', rateBarClass)}
                  style={[styles.progressFill, buildWidthStyle(`${Math.round(normalized * 100)}%`)]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.savingsRateHealthyMarker,
                    buildLeftStyle(healthyMarkerLeft),
                    { backgroundColor: healthyMarkerColor },
                  ]}
                />
              </View>
              <Text variant="label" tone="muted" className="mt-2">
                {savingsRate === null
                  ? I18n.t('insights.analytics.savings_rate.no_income_message')
                  : I18n.t('insights.analytics.savings_rate.goal_hint')}
              </Text>
            </View>

            <View className="flex-row items-stretch border-t border-border/40 pt-3">
              <View className="flex-1">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.calendar.income')}
                </Text>
                {renderValueNode(pageData.totalIncome, {
                  variant: 'caption',
                  textClassName: 'mt-0.5 text-success',
                  iconColor: themeColors.success,
                })}
              </View>
              <View className="mx-3 w-px bg-border/40" />
              <View className="flex-1">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.calendar.expense')}
                </Text>
                {renderValueNode(pageData.totalExpense, {
                  variant: 'caption',
                  textClassName: 'mt-0.5 text-destructive',
                  iconColor: themeColors.error,
                })}
              </View>
              <View className="mx-3 w-px bg-border/40" />
              <View className="flex-1">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.calendar.net')}
                </Text>
                {renderValueNode(Math.abs(pageData.totalNet), {
                  variant: 'caption',
                  textClassName: cn(
                    'mt-0.5',
                    pageData.totalNet >= 0 ? 'text-success' : 'text-destructive',
                  ),
                  iconColor: pageData.totalNet >= 0 ? themeColors.success : themeColors.error,
                })}
              </View>
            </View>
          </Card>

          <View className="gap-1.5">
            {pageData.savingsRateRows.map((row) => {
              const monthlyRate = row.savingsRate;
              const monthlySavedAmount = Math.abs(row.net);
              const monthlyRateLabel =
                monthlyRate === null
                  ? I18n.t('insights.analytics.savings_rate.no_income_short')
                  : `${(monthlyRate * 100).toFixed(1)}%`;
              const monthlySavedAmountClass =
                row.net > 0
                  ? 'text-success'
                  : row.net < 0
                    ? 'text-destructive'
                    : 'text-muted-foreground';
              const monthlySavedBadgeClass =
                row.net > 0
                  ? 'border-success/30 bg-success/10'
                  : row.net < 0
                    ? 'border-destructive/30 bg-destructive/10'
                    : 'border-border/35 bg-secondary/20';
              const monthlyIntensity =
                monthlyRate === null ? 0 : Math.max(0, Math.min(1, Math.abs(monthlyRate)));
              const monthlyToneClass =
                monthlyRate === null
                  ? 'text-muted-foreground'
                  : monthlyRate >= 0.2
                    ? 'text-success'
                    : monthlyRate >= 0
                      ? 'text-warning'
                      : 'text-destructive';
              const monthlyBarClass =
                monthlyRate === null
                  ? 'bg-border'
                  : monthlyRate >= 0.2
                    ? 'bg-success'
                    : monthlyRate >= 0
                      ? 'bg-warning'
                      : 'bg-destructive';
              return (
                <Pressable
                  key={row.monthKey}
                  onPress={() => {
                    const targetMonthKey = row.monthKey;
                    const rangeStart = pageData.range.start;
                    const rangeEnd = pageData.range.end;
                    openDrilldown({
                      label: row.label,
                      transactions: row.transactions,
                      showTypeFilter: true,
                      triggerSelectionHaptic: true,
                      scopeMatcher: (transaction) => {
                        if (transaction.type !== 'income' && transaction.type !== 'expense') {
                          return false;
                        }
                        if (transaction.date < rangeStart || transaction.date > rangeEnd) {
                          return false;
                        }
                        if (
                          (transactionMonthKeyById.get(transaction.id) ??
                            monthKeyFromIsoLocal(transaction.date)) !== targetMonthKey
                        ) {
                          return false;
                        }
                        const categoryId = transaction.categoryId;
                        if (!categoryId) return true;
                        const category = categoryById.get(categoryId);
                        const rootCategoryId = category?.parentId ?? categoryId;
                        if (transaction.type === 'income') {
                          return (
                            !excludedSavingsIncomeCategorySet.has(categoryId) &&
                            !excludedSavingsIncomeCategorySet.has(rootCategoryId)
                          );
                        }
                        return (
                          !excludedSavingsExpenseCategorySet.has(categoryId) &&
                          !excludedSavingsExpenseCategorySet.has(rootCategoryId)
                        );
                      },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                  className="rounded-xl border border-border/30 bg-card/90 px-2.5 py-2 active:opacity-85"
                >
                  <View className="flex-row items-center justify-between">
                    <Text variant="caption">{row.label}</Text>
                    <View className="flex-row items-center gap-1.5">
                      <View
                        className={cn('rounded-full border px-2 py-[3px]', monthlySavedBadgeClass)}
                      >
                        {renderCompactValueNode(monthlySavedAmount, {
                          variant: 'label',
                          textClassName: cn(monthlySavedAmountClass),
                          iconColor:
                            row.net > 0
                              ? themeColors.success
                              : row.net < 0
                                ? themeColors.error
                                : themeColors.textMuted,
                        })}
                      </View>
                      <Text variant="caption" className={cn(monthlyToneClass)}>
                        {monthlyRateLabel}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <View
                      className={cn('h-full rounded-full', monthlyBarClass)}
                      style={[
                        styles.progressFill,
                        buildWidthStyle(`${Math.round(monthlyIntensity * 100)}%`),
                      ]}
                    />
                  </View>
                  <View className="mt-2 flex-row items-center justify-between gap-2">
                    {renderValueNode(row.income, {
                      variant: 'label',
                      textClassName: 'text-success/90',
                      iconColor: themeColors.success,
                    })}
                    {renderValueNode(row.expense, {
                      variant: 'label',
                      textClassName: 'text-destructive/90',
                      iconColor: themeColors.error,
                    })}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }

    return (
      <EmptyState
        title={I18n.t('insights.empty.title')}
        message={I18n.t('insights.empty.message')}
        mascotMood="curious"
        animateIn={false}
      />
    );
  };

  const renderInsightsPane = (pageData: InsightPageData) => {
    if (pageData.kind === 'calendar') {
      return renderCalendarPane(pageData);
    }
    if (pageData.kind === 'expense_trend') {
      return renderExpenseTrendPane(pageData);
    }
    if (pageData.kind === 'income_trend') {
      return renderIncomeTrendPane(pageData);
    }
    if (pageData.kind === 'expense_sentiment') {
      return renderExpenseSentimentPane(pageData);
    }
    if (pageData.kind === 'asset_history') {
      return renderAssetHistoryPane(pageData);
    }
    if (pageData.kind === 'income_rate_history') {
      return renderIncomeRateHistoryPane(pageData);
    }
    if (pageData.kind === 'analytics') {
      return renderAnalyticsPane(pageData);
    }
    if (pageData.kind === 'time_cost') {
      return renderTimeCostPane(pageData);
    }
    return renderBreakdownPane(pageData);
  };
  const renderInsightsPaneRef = useRef(renderInsightsPane);
  if (renderInsightsPaneRef.current !== renderInsightsPane) {
    renderInsightsPaneRef.current = renderInsightsPane;
  }
  const renderInsightsPaneStable = useCallback(
    (pageData: InsightPageData) => renderInsightsPaneRef.current(pageData),
    [],
  );
  const paneRenderVersion = useMemo(
    () =>
      [
        activeBreakdownSliceId ?? '',
        selectedCalendarDayKey ?? '',
        timeCostViewMode,
        selectedIncomeRatePointIndex === null ? '' : String(selectedIncomeRatePointIndex),
        incomeRateDisplayUnit,
        activeLocale,
        settings.currencySymbol,
        settings.displayMode,
        isDark ? 'dark' : 'light',
        serializeRecordForSignature(expenseTrendScrubMonthByYear),
        serializeRecordForSignature(incomeTrendScrubMonthByYear),
        serializeRecordForSignature(assetHistoryScrubMonthByYear),
      ].join('|'),
    [
      activeBreakdownSliceId,
      activeLocale,
      assetHistoryScrubMonthByYear,
      expenseTrendScrubMonthByYear,
      incomeRateDisplayUnit,
      incomeTrendScrubMonthByYear,
      isDark,
      selectedCalendarDayKey,
      selectedIncomeRatePointIndex,
      settings.currencySymbol,
      settings.displayMode,
      timeCostViewMode,
    ],
  );
  const renderInsightsWindowPage = useCallback(
    ({ item }: { item: number }) => {
      const pageOffset = item - displayCommittedPageIndex;
      const pagePeriodState = shiftPeriodStateBySteps(
        displayCurrentPeriodState,
        pageOffset,
        displayPeriodPreset,
      );
      const pageData = getCachedPageData(
        pagePeriodState,
        displaySelectedInsightType,
        displayPeriodPreset,
      );

      return (
        <InsightsWindowPage
          item={item}
          pageData={pageData}
          pageStyle={insightsPageStyle}
          isChartScrubbing={isChartScrubbing}
          paneRenderVersion={paneRenderVersion}
          getPageScrollRef={getPageScrollRef}
          renderInsightsPane={renderInsightsPaneStable}
        />
      );
    },
    [
      displayCommittedPageIndex,
      displayCurrentPeriodState,
      displayPeriodPreset,
      displaySelectedInsightType,
      getCachedPageData,
      getPageScrollRef,
      insightsPageStyle,
      isChartScrubbing,
      paneRenderVersion,
      renderInsightsPaneStable,
      shiftPeriodStateBySteps,
    ],
  );

  const accountOptions = useMemo(() => accounts.slice(0, 6), [accounts]);
  useEffect(() => {
    if (!excludedTimeCostExpenseCategoryId) return;
    const stillExists = categories.some(
      (category) =>
        category.type === 'expense' && category.id === excludedTimeCostExpenseCategoryId,
    );
    if (!stillExists) {
      setExcludedTimeCostExpenseCategoryId(null);
    }
  }, [categories, excludedTimeCostExpenseCategoryId]);
  useEffect(() => {
    if (excludedExpenseTrendAccountIds.length === 0) return;
    const validAccountIds = new Set(accounts.map((account) => account.id));
    setExcludedExpenseTrendAccountIds((previous) => {
      const next = previous.filter((accountId) => validAccountIds.has(accountId));
      return next.length === previous.length ? previous : next;
    });
  }, [accounts, excludedExpenseTrendAccountIds.length]);
  useEffect(() => {
    if (excludedExpenseTrendExpenseCategoryIds.length === 0) return;
    const validExpenseCategoryIds = new Set(
      categories.filter((category) => category.type === 'expense').map((category) => category.id),
    );
    setExcludedExpenseTrendExpenseCategoryIds((previous) => {
      const next = previous.filter((categoryId) => validExpenseCategoryIds.has(categoryId));
      return next.length === previous.length ? previous : next;
    });
  }, [categories, excludedExpenseTrendExpenseCategoryIds.length]);
  useEffect(() => {
    if (excludedIncomeTrendAccountIds.length === 0) return;
    const validAccountIds = new Set(accounts.map((account) => account.id));
    setExcludedIncomeTrendAccountIds((previous) => {
      const next = previous.filter((accountId) => validAccountIds.has(accountId));
      return next.length === previous.length ? previous : next;
    });
  }, [accounts, excludedIncomeTrendAccountIds.length]);
  useEffect(() => {
    if (excludedIncomeTrendIncomeCategoryIds.length === 0) return;
    const validIncomeCategoryIds = new Set(
      categories.filter((category) => category.type === 'income').map((category) => category.id),
    );
    setExcludedIncomeTrendIncomeCategoryIds((previous) => {
      const next = previous.filter((categoryId) => validIncomeCategoryIds.has(categoryId));
      return next.length === previous.length ? previous : next;
    });
  }, [categories, excludedIncomeTrendIncomeCategoryIds.length]);
  useEffect(() => {
    if (excludedAssetHistoryAccountIds.length === 0) return;
    const validAccountIds = new Set(assetHistoryAccountOptions.map((account) => account.id));
    setExcludedAssetHistoryAccountIds((previous) => {
      const next = previous.filter((accountId) => validAccountIds.has(accountId));
      return next.length === previous.length ? previous : next;
    });
  }, [assetHistoryAccountOptions, excludedAssetHistoryAccountIds.length]);
  const savingsIncomeCategoryPanel = useMemo(
    () => buildInsightsCategoryPanelData(categories, 'income'),
    [categories],
  );
  const savingsExpenseCategoryPanel = useMemo(
    () => buildInsightsCategoryPanelData(categories, 'expense'),
    [categories],
  );
  const displayActiveInsightFilterConfig = useMemo(
    () => getInsightFilterConfig(displaySelectedInsightType),
    [displaySelectedInsightType],
  );
  const displayHasPeriodFilter = displayActiveInsightFilterConfig.fixedPeriodPreset === null;
  const displayHasAccountFilter = displayActiveInsightFilterConfig.allowAccountFilter;
  const displayHasExpenseTrendExclusionFilter = displaySelectedInsightType === 'expense_trend';
  const displayHasIncomeTrendExclusionFilter = displaySelectedInsightType === 'income_trend';
  const displayHasSavingsCategoryExclusionFilter = displaySelectedInsightType === 'savings_rate';
  const displayHasTimeCostExpenseCategoryExclusionFilter =
    displaySelectedInsightType === 'time_cost_leaderboard';
  const displayHasAssetHistoryAccountExclusionFilter =
    displaySelectedInsightType === 'asset_history';
  const displayHasInsightsFilters =
    displayHasPeriodFilter ||
    displayHasAccountFilter ||
    displayHasExpenseTrendExclusionFilter ||
    displayHasIncomeTrendExclusionFilter ||
    displayHasSavingsCategoryExclusionFilter ||
    displayHasTimeCostExpenseCategoryExclusionFilter ||
    displayHasAssetHistoryAccountExclusionFilter;
  const displayInsightsFilterCount = useMemo(() => {
    if (!displayHasInsightsFilters) return 0;
    let count = 0;
    if (
      displayHasPeriodFilter &&
      displayPeriodPreset !== getDefaultPeriodPreset(displaySelectedInsightType)
    )
      count += 1;
    if (displayHasAccountFilter && selectedAccountIds.length > 0) count += 1;
    if (displayHasExpenseTrendExclusionFilter) {
      count +=
        excludedExpenseTrendAccountIds.length + excludedExpenseTrendExpenseCategoryIds.length;
    }
    if (displayHasIncomeTrendExclusionFilter) {
      count += excludedIncomeTrendAccountIds.length + excludedIncomeTrendIncomeCategoryIds.length;
    }
    if (displayHasAssetHistoryAccountExclusionFilter)
      count += excludedAssetHistoryAccountIds.length;
    if (displayHasSavingsCategoryExclusionFilter) {
      count += excludedSavingsIncomeCategoryIds.length + excludedSavingsExpenseCategoryIds.length;
    }
    if (displayHasTimeCostExpenseCategoryExclusionFilter && excludedTimeCostExpenseCategoryId) {
      count += 1;
    }
    return count;
  }, [
    displayHasAccountFilter,
    displayHasAssetHistoryAccountExclusionFilter,
    displayHasExpenseTrendExclusionFilter,
    displayHasIncomeTrendExclusionFilter,
    displayHasInsightsFilters,
    displayHasPeriodFilter,
    displayHasSavingsCategoryExclusionFilter,
    displayHasTimeCostExpenseCategoryExclusionFilter,
    displayPeriodPreset,
    displaySelectedInsightType,
    excludedAssetHistoryAccountIds.length,
    excludedExpenseTrendAccountIds.length,
    excludedExpenseTrendExpenseCategoryIds.length,
    excludedIncomeTrendAccountIds.length,
    excludedIncomeTrendIncomeCategoryIds.length,
    excludedSavingsExpenseCategoryIds.length,
    excludedSavingsIncomeCategoryIds.length,
    excludedTimeCostExpenseCategoryId,
    selectedAccountIds.length,
  ]);

  const resetInsightsFilters = useCallback(() => {
    const now = new Date();
    const resetPreset = getDefaultPeriodPreset(selectedInsightType);
    setActivityRequestPeriodPreset((prev) =>
      prev?.insightType === selectedInsightType ? null : prev,
    );
    setPeriodPresetByInsight((prev) => {
      if (!(selectedInsightType in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[selectedInsightType];
      return next;
    });
    setAnchorDate(resetPreset === 'week' ? startOfDayDate(now) : startOfMonthDate(now));
    setCustomStart(formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
    setCustomEnd(formatDateInput(now));
    setActiveCustomDateField('start');
    setSelectedAccountIds([]);
    setExcludedExpenseTrendAccountIds([]);
    setExcludedExpenseTrendExpenseCategoryIds([]);
    setExcludedIncomeTrendAccountIds([]);
    setExcludedIncomeTrendIncomeCategoryIds([]);
    setExcludedSavingsIncomeCategoryIds([]);
    setExcludedSavingsExpenseCategoryIds([]);
    setExcludedTimeCostExpenseCategoryId(null);
    setExpenseTrendScrubMonthByYear({});
    setIncomeTrendScrubMonthByYear({});
    setExcludedAssetHistoryAccountIds([]);
    setAssetHistoryScrubMonthByYear({});
  }, [selectedInsightType]);

  const handleCustomDateSelect = useCallback(
    (field: 'start' | 'end', value: string) => {
      if (field === 'start') {
        setCustomStart(value);
        const nextStart = parseDateInput(value);
        const currentEnd = parseDateInput(customEnd);
        if (nextStart && currentEnd && nextStart > currentEnd) {
          setCustomEnd(value);
        }
        return;
      }
      setCustomEnd(value);
      const currentStart = parseDateInput(customStart);
      const nextEnd = parseDateInput(value);
      if (currentStart && nextEnd && nextEnd < currentStart) {
        setCustomStart(value);
      }
    },
    [customEnd, customStart],
  );
  const measurePeriodPickerTrigger = useCallback(() => {
    periodPickerTriggerRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (measuredWidth <= 0 || measuredHeight <= 0) return;
      setPeriodPickerAnchorRect({
        x,
        y,
        width: measuredWidth,
        height: measuredHeight,
      });
    });
  }, []);
  const handlePeriodPickerTriggerLayout = useCallback(() => {
    if (!isPeriodPickerOpen) return;
    measurePeriodPickerTrigger();
  }, [isPeriodPickerOpen, measurePeriodPickerTrigger]);
  const applyPeriodPickerSelection = useCallback(
    (payload: PeriodPickerCommitPayload) => {
      setIsPeriodPickerOpen(false);
      if (activeInsightFilterConfig.fixedPeriodPreset === null) {
        setPeriodPreset(payload.preset);
      } else {
        setActivityRequestPeriodPreset((prev) =>
          prev?.insightType === selectedInsightType ? null : prev,
        );
      }
      setAnchorDate(payload.anchorDate);
      if (payload.preset === 'custom' && payload.customStart && payload.customEnd) {
        setCustomStart(payload.customStart);
        setCustomEnd(payload.customEnd);
        setActiveCustomDateField(payload.activeCustomDateField ?? 'start');
      }
      recenterInsightsPager();
    },
    [
      activeInsightFilterConfig.fixedPeriodPreset,
      recenterInsightsPager,
      selectedInsightType,
      setPeriodPreset,
    ],
  );
  const handleOpenPeriodPicker = useCallback(() => {
    measurePeriodPickerTrigger();
    setIsFilterModalOpen(false);
    setIsPeriodPickerOpen(true);
  }, [measurePeriodPickerTrigger]);
  const handleInsightTypeChange = useCallback(
    (value: string) => {
      if (!isInsightType(value)) return;
      const nextInsightType = value;
      setIsPeriodPickerOpen(false);
      setActivityRequestPeriodPreset((prev) =>
        prev?.insightType === selectedInsightType ? null : prev,
      );
      const nextEffectivePreset =
        getInsightFilterConfig(nextInsightType).fixedPeriodPreset ??
        periodPresetByInsight[nextInsightType] ??
        getDefaultPeriodPreset(nextInsightType);
      const currentEffectivePreset = effectivePeriodPreset;

      const periodMode = (p: PeriodPreset) =>
        p === 'month' ? 'month' : p === 'year' ? 'year' : 'other';
      if (periodMode(currentEffectivePreset) !== periodMode(nextEffectivePreset)) {
        const now = new Date();
        setAnchorDate(nextEffectivePreset === 'week' ? startOfDayDate(now) : startOfMonthDate(now));
      }

      setActiveBreakdownSlice(null, false);
      setSelectedCalendarDayKey(null);
      setSelectedIncomeRatePointIndex(null);
      setSelectedInsightType(nextInsightType);
    },
    [effectivePeriodPreset, periodPresetByInsight, selectedInsightType, setActiveBreakdownSlice],
  );
  const handleOpenFiltersModal = useCallback(() => {
    setIsPeriodPickerOpen(false);
    setIsFilterModalOpen(true);
  }, []);
  const handleInsightTypeSelectorLayout = useCallback(() => {
    if (!onTutorialTargetLayout) return;
    insightsTypeSelectorRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (measuredWidth <= 0 || measuredHeight <= 0) return;
      onTutorialTargetLayout('insights.type_selector', {
        x,
        y,
        width: measuredWidth,
        height: measuredHeight,
      });
    });
  }, [onTutorialTargetLayout]);
  useEffect(() => {
    if (!isPeriodPickerOpen) return;
    const frame = requestAnimationFrame(() => {
      measurePeriodPickerTrigger();
    });
    return () => cancelAnimationFrame(frame);
  }, [height, isPeriodPickerOpen, measurePeriodPickerTrigger, width]);
  useEffect(() => {
    if (!tutorialSpotlightRequest?.active) return;
    if (tutorialSpotlightRequest.targetId !== 'insights.type_selector') return;

    const firstPass = setTimeout(() => {
      handleInsightTypeSelectorLayout();
    }, 40);
    const secondPass = setTimeout(() => {
      handleInsightTypeSelectorLayout();
    }, 220);

    return () => {
      clearTimeout(firstPass);
      clearTimeout(secondPass);
    };
  }, [handleInsightTypeSelectorLayout, tutorialSpotlightRequest]);
  const openDrilldown = useCallback(
    (nextState: {
      label: string;
      transactions: TransactionWithRelations[];
      showTypeFilter?: boolean;
      scopeMatcher?: DrilldownScopeMatcher;
      categoryRootId?: string;
      categoryRootLabel?: string;
      categoryRootEmoji?: string;
      categoryRootColor?: string;
      triggerSelectionHaptic?: boolean;
    }) => {
      const sourceTransactions = nextState.scopeMatcher
        ? nextState.transactions.filter((transaction) => nextState.scopeMatcher?.(transaction))
        : nextState.transactions;
      if (nextState.triggerSelectionHaptic) {
        void triggerHaptic('selection');
      }
      onOpenDrilldown({
        label: nextState.label,
        transactionIds: sourceTransactions.map((transaction) => transaction.id),
        showTypeFilter: nextState.showTypeFilter ?? false,
        categoryRootId: nextState.categoryRootId,
        categoryRootLabel: nextState.categoryRootLabel,
        categoryRootEmoji: nextState.categoryRootEmoji,
        categoryRootColor: nextState.categoryRootColor,
      });
    },
    [onOpenDrilldown],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <MonthControlsHeader
        titleNode={
          <View ref={insightsTypeSelectorRef} onLayout={handleInsightTypeSelectorLayout}>
            <SelectField
              triggerSize="header"
              triggerVariant="header-plain"
              value={displaySelectedInsightType}
              options={insightTypeOptions}
              optionGroups={insightTypeOptionGroups}
              optionsLayout="icon-grid"
              sheetTitle={I18n.t('insights.insight_type')}
              onChange={handleInsightTypeChange}
              fullHeight
            />
          </View>
        }
        monthLabel={activePeriodLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onMonthPress={
          displaySelectedInsightType === 'income_rate_history' ? undefined : handleOpenPeriodPicker
        }
        monthTriggerRef={periodPickerTriggerRef}
        onMonthTriggerLayout={handlePeriodPickerTriggerLayout}
        hideNavigation={displaySelectedInsightType === 'income_rate_history'}
        actions={
          <View className="flex-row items-center gap-2">
            {displayHasInsightsFilters && (
              <FilterIconButton
                onPress={handleOpenFiltersModal}
                count={displayInsightsFilterCount}
              />
            )}
            <DisplayModeToggle />
          </View>
        }
      />

      <View className="flex-1 overflow-hidden bg-background">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text variant="friendly" tone="muted" className="mt-3">
              {I18n.t('insights.loading')}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={horizontalListRef}
            data={insightsPagerSlots}
            keyExtractor={insightsPagerKeyExtractor}
            style={INSIGHTS_LIST_STYLE}
            horizontal
            pagingEnabled
            disableIntervalMomentum
            scrollEnabled={
              !isChartScrubbing && displaySelectedInsightType !== 'income_rate_history'
            }
            bounces={false}
            directionalLockEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            overScrollMode="never"
            nestedScrollEnabled
            removeClippedSubviews
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={3}
            renderItem={renderInsightsWindowPage}
            initialScrollIndex={INSIGHTS_PAGER_CENTER_INDEX}
            getItemLayout={getHorizontalItemLayout}
            onScroll={handleHorizontalScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={handleHorizontalScrollBeginDrag}
            onScrollEndDrag={handleHorizontalScrollEndDrag}
            onMomentumScrollEnd={handleHorizontalMomentumEnd}
            onScrollToIndexFailed={handleHorizontalScrollToIndexFailed}
          />
        )}
      </View>

      <PeriodPickerPopover
        visible={isPeriodPickerOpen && displaySelectedInsightType !== 'income_rate_history'}
        anchorRect={periodPickerAnchorRect}
        screenWidth={width}
        screenHeight={height}
        locale={activeLocale}
        currentPreset={effectivePeriodPreset}
        currentAnchorDate={currentPeriodState.anchorDate}
        currentCustomStart={customStart}
        currentCustomEnd={customEnd}
        currentCustomDateField={activeCustomDateField}
        onClose={() => setIsPeriodPickerOpen(false)}
        onCommit={applyPeriodPickerSelection}
      />

      <ThemeModal
        visible={hasInsightsFilters && isFilterModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View style={styles.insightsFilterModalHeader}>
            <View>
              <Text variant="subheading">{I18n.t('insights.filters.title')}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  resetInsightsFilters();
                }}
                className="bg-secondary/70"
                style={styles.insightsFilterActionButton}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.reset')}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.reset')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setIsFilterModalOpen(false);
                }}
                className="bg-secondary"
                style={styles.insightsFilterActionButton}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.done')}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.done')}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={INSIGHTS_FILTER_MODAL_CONTENT_STYLE}
          >
            {hasPeriodFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.period')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.insightsFilterPillsContent}
                >
                  {(activeInsightFilterConfig.allowedPeriodPresets ?? PERIOD_TABS).map((tab) => (
                    <FilterPill
                      key={tab}
                      label={I18n.t(`insights.period.${tab}`)}
                      active={periodPreset === tab}
                      onPress={() => {
                        if (tab === 'week' && periodPreset !== 'week') {
                          const currentRange = getPeriodRange(
                            effectivePeriodPreset,
                            currentPeriodState.anchorDate,
                            currentPeriodState.customStart,
                            currentPeriodState.customEnd,
                          );
                          setAnchorDate(resolveWeekAnchorDateFromRange(currentRange));
                        }
                        setPeriodPreset(tab);
                        if (tab === 'custom') setActiveCustomDateField('start');
                      }}
                    />
                  ))}
                </ScrollView>
                {periodPreset === 'custom' ? (
                  <View className="gap-2">
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setActiveCustomDateField('start');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('insights.filters.start')}
                        accessibilityState={{ selected: activeCustomDateField === 'start' }}
                        className={cn(
                          'flex-1 rounded-xl border px-3 py-2.5',
                          activeCustomDateField === 'start'
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border/30 bg-card',
                        )}
                      >
                        <Text variant="label" tone="muted">
                          {I18n.t('insights.filters.start')}
                        </Text>
                        <Text variant="caption" className="mt-0.5">
                          {customStart}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setActiveCustomDateField('end');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('insights.filters.end')}
                        accessibilityState={{ selected: activeCustomDateField === 'end' }}
                        className={cn(
                          'flex-1 rounded-xl border px-3 py-2.5',
                          activeCustomDateField === 'end'
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border/30 bg-card',
                        )}
                      >
                        <Text variant="label" tone="muted">
                          {I18n.t('insights.filters.end')}
                        </Text>
                        <Text variant="caption" className="mt-0.5">
                          {customEnd}
                        </Text>
                      </Pressable>
                    </View>
                    <View
                      className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                      style={styles.insightsFilterDatePanel}
                    >
                      <DatePanel
                        value={activeCustomDateField === 'start' ? customStart : customEnd}
                        onSelect={(value) => handleCustomDateSelect(activeCustomDateField, value)}
                        showQuickDates={false}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {hasAccountFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.accounts')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.insightsFilterPillsContent}
                >
                  <FilterPill
                    label={I18n.t('insights.filters.all')}
                    active={selectedAccountIds.length === 0}
                    onPress={() => setSelectedAccountIds([])}
                  />
                  {accountOptions.map((a) => (
                    <FilterPill
                      key={a.id}
                      label={a.name}
                      active={selectedAccountIds.includes(a.id)}
                      onPress={() => setSelectedAccountIds((prev) => toggleStringId(prev, a.id))}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {hasAssetHistoryAccountExclusionFilter ? (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_accounts')}
                  </Text>
                  <FilterPill
                    label={I18n.t('common.clear')}
                    active={excludedAssetHistoryAccountIds.length === 0}
                    onPress={() => setExcludedAssetHistoryAccountIds([])}
                  />
                </View>
                <View
                  className={FILTER_SELECTION_PANEL_CLASS}
                  style={styles.insightsFilterSelectionPanel}
                >
                  <AccountPanel
                    accounts={assetHistoryAccountOptions}
                    accountGroups={accountGroups}
                    selectedIds={excludedAssetHistoryAccountIds}
                    onToggleSelect={(accountId) =>
                      setExcludedAssetHistoryAccountIds((previous) =>
                        toggleStringId(previous, accountId),
                      )
                    }
                  />
                </View>
              </View>
            ) : null}

            {hasExpenseTrendExclusionFilter ? (
              <View className="gap-3">
                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.exclude_accounts')}
                    </Text>
                    <FilterPill
                      label={I18n.t('common.clear')}
                      active={excludedExpenseTrendAccountIds.length === 0}
                      onPress={() => setExcludedExpenseTrendAccountIds([])}
                    />
                  </View>
                  <View
                    className={FILTER_SELECTION_PANEL_CLASS}
                    style={styles.insightsFilterSelectionPanel}
                  >
                    <AccountPanel
                      accounts={accounts}
                      accountGroups={accountGroups}
                      selectedIds={excludedExpenseTrendAccountIds}
                      onToggleSelect={(accountId) =>
                        setExcludedExpenseTrendAccountIds((previous) =>
                          toggleStringId(previous, accountId),
                        )
                      }
                    />
                  </View>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.exclude_expense_categories')}
                    </Text>
                    <FilterPill
                      label={I18n.t('common.clear')}
                      active={excludedExpenseTrendExpenseCategoryIds.length === 0}
                      onPress={() => setExcludedExpenseTrendExpenseCategoryIds([])}
                    />
                  </View>
                  <View
                    className={FILTER_SELECTION_PANEL_CLASS}
                    style={styles.insightsFilterSelectionPanel}
                  >
                    <CategoryPanel
                      parents={savingsExpenseCategoryPanel.parents}
                      childByParent={savingsExpenseCategoryPanel.childByParent}
                      selectedCategoryIds={excludedExpenseTrendExpenseCategoryIds}
                      onToggleSelect={(categoryId) =>
                        setExcludedExpenseTrendExpenseCategoryIds((previous) =>
                          toggleStringId(previous, categoryId),
                        )
                      }
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {hasIncomeTrendExclusionFilter ? (
              <View className="gap-3">
                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.exclude_accounts')}
                    </Text>
                    <FilterPill
                      label={I18n.t('common.clear')}
                      active={excludedIncomeTrendAccountIds.length === 0}
                      onPress={() => setExcludedIncomeTrendAccountIds([])}
                    />
                  </View>
                  <View
                    className={FILTER_SELECTION_PANEL_CLASS}
                    style={styles.insightsFilterSelectionPanel}
                  >
                    <AccountPanel
                      accounts={accounts}
                      accountGroups={accountGroups}
                      selectedIds={excludedIncomeTrendAccountIds}
                      onToggleSelect={(accountId) =>
                        setExcludedIncomeTrendAccountIds((previous) =>
                          toggleStringId(previous, accountId),
                        )
                      }
                    />
                  </View>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.exclude_income_categories')}
                    </Text>
                    <FilterPill
                      label={I18n.t('common.clear')}
                      active={excludedIncomeTrendIncomeCategoryIds.length === 0}
                      onPress={() => setExcludedIncomeTrendIncomeCategoryIds([])}
                    />
                  </View>
                  <View
                    className={FILTER_SELECTION_PANEL_CLASS}
                    style={styles.insightsFilterSelectionPanel}
                  >
                    <CategoryPanel
                      parents={savingsIncomeCategoryPanel.parents}
                      childByParent={savingsIncomeCategoryPanel.childByParent}
                      selectedCategoryIds={excludedIncomeTrendIncomeCategoryIds}
                      onToggleSelect={(categoryId) =>
                        setExcludedIncomeTrendIncomeCategoryIds((previous) =>
                          toggleStringId(previous, categoryId),
                        )
                      }
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {hasTimeCostExpenseCategoryExclusionFilter ? (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_expense_categories')}
                  </Text>
                  <FilterPill
                    label={I18n.t('common.clear')}
                    active={excludedTimeCostExpenseCategoryId === null}
                    onPress={() => setExcludedTimeCostExpenseCategoryId(null)}
                  />
                </View>
                <View
                  className={FILTER_SELECTION_PANEL_CLASS}
                  style={styles.insightsFilterSelectionPanel}
                >
                  <CategoryPanel
                    parents={savingsExpenseCategoryPanel.parents}
                    childByParent={savingsExpenseCategoryPanel.childByParent}
                    selectedCategoryId={excludedTimeCostExpenseCategoryId}
                    onSelect={(categoryId) => setExcludedTimeCostExpenseCategoryId(categoryId)}
                  />
                </View>
              </View>
            ) : null}

            {hasSavingsCategoryExclusionFilter ? (
              <View className="gap-3">
                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.exclude_income_categories')}
                    </Text>
                    <FilterPill
                      label={I18n.t('common.clear')}
                      active={excludedSavingsIncomeCategoryIds.length === 0}
                      onPress={() => setExcludedSavingsIncomeCategoryIds([])}
                    />
                  </View>
                  <View
                    className={FILTER_SELECTION_PANEL_CLASS}
                    style={styles.insightsFilterSelectionPanel}
                  >
                    <CategoryPanel
                      parents={savingsIncomeCategoryPanel.parents}
                      childByParent={savingsIncomeCategoryPanel.childByParent}
                      selectedCategoryIds={excludedSavingsIncomeCategoryIds}
                      onToggleSelect={(categoryId) =>
                        setExcludedSavingsIncomeCategoryIds((prev) =>
                          toggleStringId(prev, categoryId),
                        )
                      }
                    />
                  </View>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.exclude_expense_categories')}
                    </Text>
                    <FilterPill
                      label={I18n.t('common.clear')}
                      active={excludedSavingsExpenseCategoryIds.length === 0}
                      onPress={() => setExcludedSavingsExpenseCategoryIds([])}
                    />
                  </View>
                  <View
                    className={FILTER_SELECTION_PANEL_CLASS}
                    style={styles.insightsFilterSelectionPanel}
                  >
                    <CategoryPanel
                      parents={savingsExpenseCategoryPanel.parents}
                      childByParent={savingsExpenseCategoryPanel.childByParent}
                      selectedCategoryIds={excludedSavingsExpenseCategoryIds}
                      onToggleSelect={(categoryId) =>
                        setExcludedSavingsExpenseCategoryIds((prev) =>
                          toggleStringId(prev, categoryId),
                        )
                      }
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </ThemeModal>

      <ThemeModal
        visible={isIncomeRateUnitPickerOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setIsIncomeRateUnitPickerOpen(false)}
      >
        <View className="flex-1 justify-end" pointerEvents="box-none">
          <Pressable
            className="absolute inset-0 bg-black/20"
            onPress={() => setIsIncomeRateUnitPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
          />
          <View
            style={styles.incomeRateUnitPickerSheet}
            className="rounded-[24px] border border-border/45 bg-background"
          >
            <View className="pb-2">
              <Text variant="subheading">
                {I18n.t('insights.analytics.income_rate_history.rate_title')}
              </Text>
            </View>
            <View className="gap-2">
              {incomeRateUnitOptions.map((option) => {
                const isSelected = incomeRateDisplayUnit === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setIncomeRateDisplayUnit(option.value);
                      setIsIncomeRateUnitPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: isSelected }}
                    className={cn(
                      'rounded-2xl border px-3.5 py-3',
                      isSelected ? 'border-primary/50 bg-primary/10' : 'border-border/40 bg-card',
                    )}
                  >
                    <Text variant="caption">{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ThemeModal>
    </SafeAreaView>
  );
}
