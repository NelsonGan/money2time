import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Landmark,
  PiggyBank,
  SlidersHorizontal,
  Smile,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  Easing as RNEasing,
  FlatList,
  Image,
  InteractionManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { AnimatedRollingNumber } from 'react-native-animated-rolling-numbers';
import { PieChart } from 'react-native-gifted-charts';
import { type GraphPoint, LineGraph } from 'react-native-graph';
import { Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Image as SvgImage, Polyline, Text as SvgText } from 'react-native-svg';

import { DatePickerModal } from '~/components/datePicker';
import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import {
  useBottomNavContentInset,
  useBottomNavScrollReporter,
} from '~/components/navigation/BottomNavMinimize';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  AccountPickerSheet,
  Card,
  CategoryEmoji,
  CategoryPickerSheet,
  GradientPercent,
  Text,
  ThemeModal,
  TimeValueInline,
} from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { resolveCategoryIconSource } from '~/constants/categoryIcons';
import { CHART_CATEGORY_COLORS } from '~/constants/chartColors';
import { type ColorPalette, LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { LONG_RANGE_PAGER_CENTER_INDEX, LONG_RANGE_PAGER_TOTAL_SLOTS } from '~/constants/pager';
import { PRO_TREND_TYPES, type ProTrendType } from '~/constants/proLimits';
import { UTILITY_ICON_SOURCES } from '~/constants/utilityIcons';
import { useApp, useTransactions } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useValueWhileTabVisible } from '~/context/TabVisibilityContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { RankedImpactChart, type RankedImpactRow } from '~/features/insights/components';
import { ProTrendPreviewOverlay } from '~/features/insights/components/ProTrendPreviewOverlay';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { SentimentStackedBarChart } from '~/features/insights/components/SentimentStackedBarChart';
import { TrendBarChart } from '~/features/insights/components/TrendBarChart';
import {
  ActivityTransactionList,
  buildBulkUpdateInputs,
  BulkEditTransactionsSheet,
  type BulkTransactionChanges,
  TransactionSelectionToolbar,
} from '~/features/transactions/components';
import type { TutorialSpotlightRequest, TutorialTargetRect } from '~/features/tutorial/types';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePersistedJsonSnapshot } from '~/hooks/usePersistedJsonSnapshot';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  consumePendingFocusInsight,
  subscribeFocusInsightRequest,
} from '~/services/insightsNavigation';
import type {
  Account,
  Category,
  CategoryType,
  TransactionWithRelations,
  UserSettings,
  WeekStartsOn,
} from '~/types';
import { cn } from '~/utils';
import { getNetAssetContribution } from '~/utils/accountBalances';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { FONT } from '~/utils/fonts';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatCompactCurrency,
  formatCompactNumber,
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

import {
  BudgetPagerView,
  type BudgetPagerViewHandle,
} from '~/features/budget/screens/BudgetScreen';

import type { InsightsDrilldownPayload } from './InsightsDrilldownScreen';

const PERIOD_TABS = ['week', 'month', 'year', 'custom'] as const;
// 'lifetime' is an opt-in preset for the trend insights (yearly bars across all
// data). It is intentionally kept out of PERIOD_TABS so it never appears for
// unrestricted insights (e.g. breakdowns) — trends surface it via
// allowedPeriodPresets instead.
type PeriodPreset = (typeof PERIOD_TABS)[number] | 'lifetime';
const LIFETIME_RANGE_START = '1900-01-01';
const LIFETIME_RANGE_END = '2999-12-31';
const INSIGHT_TYPES = [
  'expense_breakdown',
  'income_breakdown',
  'savings_rate',
  'expense_trend',
  'income_trend',
  'category_trend',
  'expense_sentiment',
  'asset_history',
] as const;
type InsightType = (typeof INSIGHT_TYPES)[number];
type BreakdownInsightType = Extract<InsightType, 'expense_breakdown' | 'income_breakdown'>;
type NavigableInsightType =
  | BreakdownInsightType
  | 'expense_trend'
  | 'expense_sentiment'
  | 'asset_history';
type AnalyticsInsightType = Extract<InsightType, 'savings_rate'>;
type BreakdownTransactionType = 'expense' | 'income';
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
  category_trend: {
    Icon: TrendingDown,
    tint: '#2F7BC4',
    background: '#E4EFFB',
    border: '#B4D2F0',
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
} as const satisfies Record<
  InsightType,
  {
    Icon: typeof TrendingUp;
    tint: string;
    background: string;
    border: string;
  }
>;

const INSIGHT_TYPE_ICON_NAME: Record<InsightType, string> = {
  expense_breakdown: 'wallet-cash',
  income_breakdown: 'wallet-cash-blue',
  savings_rate: 'piggy-bank-coins',
  expense_trend: 'market-analysis',
  income_trend: 'growth-analysis',
  category_trend: 'pie-chart',
  expense_sentiment: 'mood-faces',
  asset_history: 'home-savings',
};

function renderInsightTypeIcon(insightType: InsightType) {
  const iconSource = UTILITY_ICON_SOURCES[INSIGHT_TYPE_ICON_NAME[insightType]];
  if (iconSource) {
    return <Image source={iconSource} resizeMode="contain" style={styles.insightTypeIconImage} />;
  }

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

const INSIGHTS_CHART_COLORS = CHART_CATEGORY_COLORS;

const INSIGHTS_PAGER_TOTAL_SLOTS = LONG_RANGE_PAGER_TOTAL_SLOTS;
const INSIGHTS_PAGER_CENTER_INDEX = LONG_RANGE_PAGER_CENTER_INDEX;
const INSIGHTS_LIST_STYLE = { flex: 1 } as const;
const INSIGHTS_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: spacing.screenHorizontal,
  paddingBottom: LIST_BOTTOM_PADDING,
  paddingTop: spacing.xxs,
} as const;
const ASSET_HISTORY_CHART_HEIGHT = 226;
const ASSET_HISTORY_CHART_PADDING_RIGHT = 64;
const EXPENSE_TREND_CHART_HEIGHT = 226;
const EXPENSE_TREND_CHART_PADDING_RIGHT = 64;
const CATEGORY_TREND_X_AXIS_HEIGHT = 20;
const CATEGORY_TREND_LINE_HEIGHT = 206;
const CATEGORY_TREND_CHART_HEIGHT = CATEGORY_TREND_LINE_HEIGHT + CATEGORY_TREND_X_AXIS_HEIGHT;
const CATEGORY_TREND_CHART_PADDING_RIGHT = 64;
const CATEGORY_TREND_X_LABEL_WIDTH = 48;
const CATEGORY_TREND_TARGET_X_LABELS = 6;
const SENTIMENT_CHART_HEIGHT = 200;
const SENTIMENT_CHART_PADDING_RIGHT = 16;
const SENTIMENT_COLORS = { happy: '#4CAF50', neutral: '#FFB74D', sad: '#E57373' } as const;
const INSIGHTS_LINE_CHART_SIDE_INSET = 8;
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const INSIGHTS_LINE_CHART_SECTION_BLEED = 10;
const GRAPH_HORIZONTAL_PADDING = 8;
const GRAPH_VERTICAL_PADDING = 14;
const Y_AXIS_LABEL_BASE_FONT_SIZE = 9.5;
const Y_AXIS_LABEL_MIN_FONT_SIZE = 7.5;
const CHART_SKELETON_READY_DELAY_MS = 180;
const MONTHS_PER_YEAR = 12;
const HEALTHY_SAVINGS_RATE_THRESHOLD = 0.2;
const SAVINGS_RATE_RING_SIZE = 104;
const SAVINGS_RATE_RING_STROKE_WIDTH = 11;
const SAVINGS_RATE_ABBREVIATE_THRESHOLD = 1000;

// Formats an already-computed savings-rate percentage (e.g. 20 → "20.0%"). When the
// magnitude reaches 1000% (income tiny relative to net) it abbreviates via the shared
// compact-number helper (e.g. 1234 → "1.2K%") so the label never overflows its row and
// breaks the layout. formatCompactNumber drops the sign, so re-apply it here.
const formatSavingsRatePercentLabel = (percent: number): string => {
  if (Math.abs(percent) >= SAVINGS_RATE_ABBREVIATE_THRESHOLD) {
    const sign = percent < 0 ? '-' : '';
    return `${sign}${formatCompactNumber(Math.abs(percent))}%`;
  }
  return `${percent.toFixed(1)}%`;
};
const INSIGHTS_ROLLING_NUMBER_TEXT_STYLE = {
  fontSize: 24,
  lineHeight: 30,
  fontFamily: FONT.bold,
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
const EMPTY_CATEGORY_CHILD_MAP: Map<string, { id: string; name: string; icon: string }[]> =
  new Map();
const YEAR_MONTH_LABELS_CACHE = new Map<string, string[]>();
const MONTH_LABEL_BY_KEY_CACHE = new Map<string, string>();
const PERIOD_MONTH_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_MONTH_DAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_PICKER_SIDE_MARGIN = 12;
const PERIOD_PICKER_CARD_WIDTH = 408;
const BREAKDOWN_PIE_LABEL_MIN_WIDTH = 72;
const BREAKDOWN_PIE_LABEL_MAX_WIDTH = 88;
const BREAKDOWN_PIE_LABEL_HEIGHT = 28;
const BREAKDOWN_PIE_LABEL_LINE_LENGTH = 12;
const BREAKDOWN_PIE_LABEL_TAIL_LENGTH = 10;
const BREAKDOWN_PIE_LABEL_MARGIN = 4;
const BREAKDOWN_PIE_MIN_RADIUS = 48;
const BREAKDOWN_PIE_MAX_RADIUS = 108;

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
  breakdownPercentBadge: {
    borderRadius: 999,
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
  savingsRateRingIcon: {
    width: 44,
    height: 44,
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
  categoryTrendXAxisOverlay: {
    position: 'absolute',
    left: 0,
    height: CATEGORY_TREND_X_AXIS_HEIGHT,
  },
  categoryTrendXAxisLabel: {
    position: 'absolute',
    top: 4,
    textAlign: 'center',
    fontSize: 9.5,
  },
  insightTypeIconImage: {
    width: 32,
    height: 32,
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

function buildWeekPickerOptions(monthDate: Date, weekStartsOn: WeekStartsOn): WeekPickerOption[] {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const lastWeekStart = startOfWeekDate(monthEnd, weekStartsOn);
  const rows: WeekPickerOption[] = [];
  const cursor = startOfWeekDate(monthStart, weekStartsOn);

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
    allowedPeriodPresets: ['year', 'lifetime'] as const,
  },
  income_trend: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
    allowedPeriodPresets: ['year', 'lifetime'] as const,
  },
  category_trend: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
    allowedPeriodPresets: ['year', 'lifetime'] as const,
  },
  expense_sentiment: {
    fixedPeriodPreset: null,
    allowAccountFilter: false,
    allowedPeriodPresets: ['week', 'year'] as const,
  },
  asset_history: {
    fixedPeriodPreset: 'year',
    allowAccountFilter: false,
  },
};

function getInsightFilterConfig(insightType: InsightType): InsightFilterConfig {
  return INSIGHT_FILTER_CONFIG[insightType] ?? DEFAULT_INSIGHT_FILTER_CONFIG;
}

const DEFAULT_PERIOD_PRESET_BY_INSIGHT: Partial<Record<InsightType, PeriodPreset>> = {
  expense_trend: 'year',
  income_trend: 'year',
  category_trend: 'year',
  expense_sentiment: 'week',
};

function getDefaultPeriodPreset(insightType: InsightType): PeriodPreset {
  const config = getInsightFilterConfig(insightType);
  if (config.fixedPeriodPreset) return config.fixedPeriodPreset;
  return DEFAULT_PERIOD_PRESET_BY_INSIGHT[insightType] ?? 'month';
}

// Keeps a (possibly persisted) preset within the insight's allowed set so an option
// that was removed since the preference was saved falls back to the default.
function clampPeriodPreset(insightType: InsightType, preset: PeriodPreset): PeriodPreset {
  const config = getInsightFilterConfig(insightType);
  if (config.fixedPeriodPreset) return config.fixedPeriodPreset;
  if (config.allowedPeriodPresets && !config.allowedPeriodPresets.includes(preset)) {
    return getDefaultPeriodPreset(insightType);
  }
  return preset;
}

function getHydratedInsightPeriodPreset(
  saved: Partial<InsightsPreferencesSnapshot>,
  fallbackInsightType: InsightType = 'expense_breakdown',
): PeriodPreset {
  const insightType = saved.selectedInsightType ?? fallbackInsightType;
  const fixedPreset = getInsightFilterConfig(insightType).fixedPeriodPreset;
  if (fixedPreset) return fixedPreset;

  return clampPeriodPreset(
    insightType,
    saved.periodPresetByInsight?.[insightType] ??
      (saved.selectedInsightType === insightType ? saved.periodPreset : undefined) ??
      getDefaultPeriodPreset(insightType),
  );
}

function isInsightType(value: string): value is InsightType {
  return INSIGHT_TYPES.some((insightType) => insightType === value);
}

function isPeriodPreset(value: string): value is PeriodPreset {
  return value === 'lifetime' || PERIOD_TABS.some((preset) => preset === value);
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

interface InsightsCategoryPickerItem {
  id: string;
  name: string;
  icon: string;
}

interface InsightsCategoryPickerData {
  parents: InsightsCategoryPickerItem[];
  childByParent: Map<string, InsightsCategoryPickerItem[]>;
}

function buildInsightsCategoryPickerData(
  categories: Category[],
  categoryType: CategoryType,
): InsightsCategoryPickerData {
  const parentCategories = categories.filter(
    (category) => category.type === categoryType && category.parentId === null,
  );
  const parentIds = new Set(parentCategories.map((parent) => parent.id));
  const parentIconById = new Map<string, string>();
  parentCategories.forEach((category) => {
    parentIconById.set(category.id, category.icon);
  });
  const parents = parentCategories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: resolveCategoryIcon(category.icon),
  }));
  const childByParent = new Map<string, InsightsCategoryPickerItem[]>();

  categories.forEach((category) => {
    const parentId = category.parentId;
    if (category.type !== categoryType || !parentId || !parentIds.has(parentId)) return;
    const existing = childByParent.get(parentId);
    const child = {
      id: category.id,
      name: category.name,
      icon: resolveCategoryIcon(category.icon, parentIconById.get(parentId) ?? null),
    };
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

type TrendGranularity = 'month' | 'day' | 'year';

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

type CategoryTrendCategoryOption = {
  id: string;
  label: string;
  emoji: string;
};

type CategoryTrendPageData = InsightBasePageData & {
  kind: 'category_trend';
  year: number;
  periodKey: string;
  granularity: TrendGranularity;
  monthRows: ExpenseTrendMonthRow[];
  selectedCategoryId: string | null;
  selectableCategories: CategoryTrendCategoryOption[];
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

type InsightPageData =
  | BreakdownPageData
  | AnalyticsPageData
  | ExpenseTrendPageData
  | CategoryTrendPageData
  | IncomeTrendPageData
  | ExpenseSentimentPageData
  | AssetHistoryPageData;
type PeriodState = { anchorDate: Date; customStart: string; customEnd: string };

// Empty page-data shells for the Pro-gated trends. A non-Pro user only ever
// sees the ProTrendPreviewOverlay for these (renderInsightsPane short-circuits
// on `pageData.kind`), so there is no reason to crunch the full trend series
// over every transaction — for a large imported history that per-page build,
// run across the pager window on cold-start restore, is what froze the JS
// thread. Returning a single stable shell per kind keeps the locked path O(1)
// and reference-stable (so it can't feed a render loop). Pro users bypass this
// entirely and build the real data.
const LOCKED_TREND_EMPTY_RANGE = { start: '', end: '' } as const;
const LOCKED_TREND_PLACEHOLDERS: Record<ProTrendType, InsightPageData> = {
  expense_trend: {
    kind: 'expense_trend',
    range: LOCKED_TREND_EMPTY_RANGE,
    filteredForRange: [],
    year: 0,
    periodKey: '',
    granularity: 'month',
    monthRows: [],
    averageMonthExpense: 0,
    activeMonths: 0,
    peakMonthKey: null,
  },
  income_trend: {
    kind: 'income_trend',
    range: LOCKED_TREND_EMPTY_RANGE,
    filteredForRange: [],
    year: 0,
    periodKey: '',
    granularity: 'month',
    monthRows: [],
    averageMonthIncome: 0,
    activeMonths: 0,
    peakMonthKey: null,
  },
  category_trend: {
    kind: 'category_trend',
    range: LOCKED_TREND_EMPTY_RANGE,
    filteredForRange: [],
    year: 0,
    periodKey: '',
    granularity: 'month',
    monthRows: [],
    selectedCategoryId: null,
    selectableCategories: [],
  },
  expense_sentiment: {
    kind: 'expense_sentiment',
    range: LOCKED_TREND_EMPTY_RANGE,
    filteredForRange: [],
    dayRows: [],
    totals: { happy: 0, neutral: 0, sad: 0 },
  },
  asset_history: {
    kind: 'asset_history',
    range: LOCKED_TREND_EMPTY_RANGE,
    filteredForRange: [],
    year: 0,
    monthRows: [],
    includedAccountsCount: 0,
  },
};

function startOfDayDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeekDate(date: Date, weekStartsOn: WeekStartsOn): Date {
  const day = startOfDayDate(date);
  const offset = (day.getDay() - weekStartsOn + 7) % 7;
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
  excludedExpenseBreakdownCategoryIds: string[];
  excludedIncomeBreakdownCategoryIds: string[];
  excludedAssetHistoryAccountIds: string[];
  excludedCategoryTrendAccountIds: string[];
  categoryTrendSelectedCategoryId: string | null;
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
    next.excludedExpenseBreakdownCategoryIds = toUniqueStringList(
      parsed.excludedExpenseBreakdownCategoryIds,
    );
    next.excludedIncomeBreakdownCategoryIds = toUniqueStringList(
      parsed.excludedIncomeBreakdownCategoryIds,
    );
    if (Object.prototype.hasOwnProperty.call(parsed, 'excludedAssetHistoryAccountIds')) {
      next.excludedAssetHistoryAccountIds = toUniqueStringList(
        parsed.excludedAssetHistoryAccountIds,
      );
    }
    next.excludedCategoryTrendAccountIds = toUniqueStringList(
      parsed.excludedCategoryTrendAccountIds,
    );
    if (typeof parsed.categoryTrendSelectedCategoryId === 'string') {
      const trimmed = parsed.categoryTrendSelectedCategoryId.trim();
      next.categoryTrendSelectedCategoryId = trimmed.length > 0 ? trimmed : null;
    } else if (parsed.categoryTrendSelectedCategoryId === null) {
      next.categoryTrendSelectedCategoryId = null;
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
  // 'lifetime' spans all data regardless of the anchor, so paging is a no-op.
  return next;
}

function getPeriodRange(
  preset: PeriodPreset,
  anchorDate: Date,
  customStart: string,
  customEnd: string,
  weekStartsOn: WeekStartsOn,
) {
  if (preset === 'lifetime') {
    const start = parseDateInput(LIFETIME_RANGE_START) ?? new Date(1900, 0, 1);
    const end = parseDateInput(LIFETIME_RANGE_END) ?? new Date(2999, 11, 31);
    return toRange(start, end);
  }
  if (preset === 'custom') {
    const startDate = parseDateInput(customStart);
    const endDate = parseDateInput(customEnd);
    if (startDate && endDate && startDate <= endDate) return toRange(startDate, endDate);
  }
  if (preset === 'week') {
    const start = startOfWeekDate(anchorDate, weekStartsOn);
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
  if (preset === 'lifetime') {
    return I18n.t('insights.period.all_time');
  }
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

function dayKeyToUtcDate(dayKey: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
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

// Lifetime trends bucket by year. Rows are created on demand while scanning
// transactions; this fills any gap years between the earliest and latest bucket
// with empty rows and returns them oldest-first for a continuous bar chart.
function fillLifetimeYearRows<T extends { monthKey: string }>(
  rowByKey: Map<string, T>,
  makeEmpty: (yearKey: string) => T,
): T[] {
  const years = Array.from(rowByKey.keys())
    .map((key) => Number(key))
    .filter((year) => Number.isInteger(year));
  if (years.length === 0) return [];
  const min = Math.min(...years);
  const max = Math.max(...years);
  const rows: T[] = [];
  for (let year = min; year <= max; year++) {
    const key = String(year);
    rows.push(rowByKey.get(key) ?? makeEmpty(key));
  }
  return rows;
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

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

// Tone, icon, and status copy all derive from the same rounded percent the user
// sees, so the label and colors can never disagree (e.g. a -0.04% year rounds to
// '0.0%' and reads as the amber "getting there" state, not a red overspend).
function resolveSavingsRateStatus(displayRatePercent: number | null, palette: ColorPalette) {
  if (displayRatePercent === null) {
    return { color: palette.textMuted, Icon: PiggyBank, labelKey: 'no_income_short' as const };
  }
  if (displayRatePercent >= HEALTHY_SAVINGS_RATE_THRESHOLD * 100) {
    return { color: palette.success, Icon: PiggyBank, labelKey: 'status_healthy' as const };
  }
  if (displayRatePercent >= 0) {
    return { color: palette.accent, Icon: TrendingUp, labelKey: 'status_building' as const };
  }
  return { color: palette.error, Icon: TrendingDown, labelKey: 'status_overspent' as const };
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
  radius: number,
) {
  if (slices.length === 0 || totalAmount <= 0 || radius <= 0) return null;
  const center = radius;
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

type PieLabelLayout = {
  id: string;
  anchorX: number;
  anchorY: number;
  outerX: number;
  outerY: number;
  innerX: number;
  boxLeft: number;
  labelY: number;
};

// Label layout: anchor each label at its slice midpoint, split into left/right halves,
// then relax each side vertically to a minimum gap so labels spread out without
// overlapping. Each column's inner edge follows the pie's arc (labels near the top/bottom
// hug closer to the center, labels near the middle sit furthest out), and a short leader
// (radial stub off the slice, then a segment to the inner edge) connects them. Keeps the
// chart compact (cropped top/bottom).
function layoutBreakdownPieLabels(
  slices: { id: string; amount: number }[],
  opts: {
    cx: number;
    cy: number;
    radius: number;
    elbowLength: number;
    tailLength: number;
    labelWidth: number;
    labelHeight: number;
    labelGap: number;
    stageHeight: number;
    totalAmount: number;
  },
): PieLabelLayout[] {
  const {
    cx,
    cy,
    radius,
    elbowLength,
    tailLength,
    labelWidth,
    labelHeight,
    labelGap,
    stageHeight,
    totalAmount,
  } = opts;
  if (slices.length === 0 || totalAmount <= 0) return [];

  const TWO_PI = Math.PI * 2;
  const startAngle = -Math.PI / 2;
  let cursor = 0;
  const raw = slices.map((slice) => {
    const fraction = slice.amount / totalAmount;
    const midTheta = cursor + (fraction / 2) * TWO_PI; // from top, clockwise, 0..2π
    cursor += fraction * TWO_PI;
    const angle = startAngle + midTheta;
    const isRight = midTheta < Math.PI;
    return {
      id: slice.id,
      side: (isRight ? 'right' : 'left') as 'left' | 'right',
      anchorX: cx + radius * Math.cos(angle),
      anchorY: cy + radius * Math.sin(angle),
      outerX: cx + (radius + elbowLength) * Math.cos(angle),
      outerY: cy + (radius + elbowLength) * Math.sin(angle),
    };
  });

  const minY = labelHeight / 2;
  const maxY = Math.max(minY, stageHeight - labelHeight / 2);

  const place = (items: typeof raw, sign: 1 | -1): PieLabelLayout[] => {
    const sorted = [...items].sort((a, b) => a.outerY - b.outerY);
    const ys = sorted.map((item) => Math.min(maxY, Math.max(minY, item.outerY)));
    // Forward pass: push overlapping labels downward.
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < ys[i - 1] + labelGap) ys[i] = ys[i - 1] + labelGap;
    }
    // If the stack overflowed the bottom, anchor it there and relax back upward.
    if (ys.length > 0 && ys[ys.length - 1] > maxY) {
      ys[ys.length - 1] = maxY;
      for (let i = ys.length - 2; i >= 0; i--) {
        if (ys[i] > ys[i + 1] - labelGap) ys[i] = ys[i + 1] - labelGap;
      }
    }
    // Follow the pie's arc: the label's inner edge sits a fixed gap beyond the circle
    // edge at its own height. Near the top/bottom (where the pie is narrow) labels pull
    // in toward the center; near the middle (widest) they sit furthest out.
    const offset = elbowLength + tailLength;
    const radiusSq = radius * radius;
    return sorted.map((item, i) => {
      const labelY = ys[i];
      const dy = labelY - cy;
      const arcX = Math.sqrt(Math.max(0, radiusSq - dy * dy));
      const innerX = cx + sign * (arcX + offset);
      const boxLeft = sign === 1 ? innerX : innerX - labelWidth;
      return {
        id: item.id,
        anchorX: item.anchorX,
        anchorY: item.anchorY,
        outerX: item.outerX,
        outerY: item.outerY,
        innerX,
        boxLeft,
        labelY,
      };
    });
  };

  return [
    ...place(
      raw.filter((item) => item.side === 'right'),
      1,
    ),
    ...place(
      raw.filter((item) => item.side === 'left'),
      -1,
    ),
  ];
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

const TREND_TRANSACTIONS_INITIAL = 5;
const TREND_TRANSACTIONS_INITIAL_EXPENSE_INCOME = 7;
const TREND_TRANSACTIONS_PAGE = 10;

// Renders a selected month's transaction list capped at `visibleCount` rows. The cap
// is owned by the screen (keyed per list) and grown as the page scrolls near its end,
// so the non-virtualized list stays cheap to render while the chart is scrubbed.
const TrendMonthTransactions = React.memo(function TrendMonthTransactions({
  transactions,
  visibleCount,
  locale,
  displaySettings,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  onOpenTransaction,
  onTransactionLongPress,
  selectedTransactionIds,
  selectionMode,
  emptyTitle,
  emptyMessage,
}: {
  transactions: TransactionWithRelations[];
  visibleCount: number;
  locale: string;
  displaySettings: Pick<UserSettings, 'currencySymbol' | 'displayMode'>;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onTransactionLongPress?: (transaction: TransactionWithRelations) => void;
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
  emptyTitle: string;
  emptyMessage: string;
}) {
  // Sort only when the transaction set changes; slicing for the visible window is cheap
  // and must not re-sort on every infinite-scroll count bump.
  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const dateDelta = b.date.localeCompare(a.date);
        if (dateDelta !== 0) return dateDelta;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [transactions],
  );
  const visibleTransactions = sortedTransactions.slice(0, visibleCount);

  return (
    <ActivityTransactionList
      transactions={visibleTransactions}
      locale={locale}
      displaySettings={displaySettings}
      getDisplayValueForTransaction={getDisplayValueForTransaction}
      getTrueHourlyRateForDate={getTrueHourlyRateForDate}
      onTransactionPress={onOpenTransaction}
      onTransactionLongPress={onTransactionLongPress}
      selectedTransactionIds={selectedTransactionIds}
      selectionMode={selectionMode}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
      contentPaddingTop={0}
      contentPaddingBottom={0}
      contentPaddingHorizontal={0}
      disableItemAnimations
      disableScrollBounce
      disableVirtualization
      compactItems
      groupByDate
    />
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
  weekStartsOn,
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
  weekStartsOn: WeekStartsOn;
  currentPreset: PeriodPreset;
  currentAnchorDate: Date;
  currentCustomStart: string;
  currentCustomEnd: string;
  currentCustomDateField: 'start' | 'end';
  onClose: () => void;
  onCommit: (payload: PeriodPickerCommitPayload) => void;
}) {
  const themeColors = useThemeColors();
  const [draftAnchorDate, setDraftAnchorDate] = useState(() => startOfDayDate(currentAnchorDate));
  const [draftCustomStart, setDraftCustomStart] = useState(currentCustomStart);
  const [draftCustomEnd, setDraftCustomEnd] = useState(currentCustomEnd);
  const [draftCustomDateField, setDraftCustomDateField] = useState<'start' | 'end'>(
    currentCustomDateField,
  );
  const [customDateModalVisible, setCustomDateModalVisible] = useState(false);
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
    () =>
      getPeriodRange(
        currentPreset,
        draftAnchorDate,
        draftCustomStart,
        draftCustomEnd,
        weekStartsOn,
      ),
    [currentPreset, draftAnchorDate, draftCustomEnd, draftCustomStart, weekStartsOn],
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
  const weekOptions = useMemo(
    () => buildWeekPickerOptions(visibleWeekMonth, weekStartsOn),
    [visibleWeekMonth, weekStartsOn],
  );
  const yearPage = useMemo(
    () => Array.from({ length: MONTHS_PER_YEAR }, (_, index) => visibleYearPageStart + index),
    [visibleYearPageStart],
  );
  const monthOptions = useMemo(
    () => monthLabelsForYear(visibleMonthYear, locale),
    [locale, visibleMonthYear],
  );
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
                      onPress={() =>
                        setVisibleYearPageStart((previous) => previous - MONTHS_PER_YEAR)
                      }
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
                      onPress={() =>
                        setVisibleYearPageStart((previous) => previous + MONTHS_PER_YEAR)
                      }
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
                        setCustomDateModalVisible(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('insights.filters.start')}
                      className="flex-1 rounded-2xl border border-border/30 bg-card px-3 py-2.5"
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
                        setCustomDateModalVisible(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('insights.filters.end')}
                      className="flex-1 rounded-2xl border border-border/30 bg-card px-3 py-2.5"
                    >
                      <Text variant="label" tone="muted">
                        {I18n.t('insights.filters.end')}
                      </Text>
                      <Text variant="caption" className="mt-0.5">
                        {draftCustomEnd}
                      </Text>
                    </Pressable>
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
                      className={cn(
                        canApplyCustom ? 'text-primary-foreground' : 'text-muted-foreground',
                      )}
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
      <DatePickerModal
        visible={customDateModalVisible}
        value={draftCustomDateField === 'start' ? draftCustomStart : draftCustomEnd}
        showQuickDays={false}
        overlay
        onSelect={(value) => {
          handleCustomDateSelect(draftCustomDateField, value);
          setCustomDateModalVisible(false);
        }}
        onClose={() => setCustomDateModalVisible(false)}
      />
    </ThemeModal>
  );
}

type InsightMenuOption = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
};

function InsightTypeMenuPopover({
  visible,
  anchorRect,
  screenWidth,
  screenHeight,
  options,
  selectedValue,
  onSelect,
  onClose,
}: {
  visible: boolean;
  anchorRect: PeriodPickerAnchorRect | null;
  screenWidth: number;
  screenHeight: number;
  options: InsightMenuOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const themeColors = useThemeColors();
  const entrance = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    entrance.setValue(0);
    // A gentle fade + subtle scale-in — smoother than a spring, no overshoot.
    RNAnimated.timing(entrance, {
      toValue: 1,
      duration: 160,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, entrance]);

  if (!visible) return null;

  const sideMargin = spacing.md;
  const cardWidth = Math.min(300, screenWidth - sideMargin * 2);
  const cardLeft = clampNumber(
    anchorRect?.x ?? sideMargin,
    sideMargin,
    screenWidth - cardWidth - sideMargin,
  );
  // Anchor the card to the button itself so it expands *in place* rather than
  // dropping down beneath the icon.
  const cardTop = clampNumber(
    anchorRect?.y ?? spacing.xl * 2,
    sideMargin,
    screenHeight - 220 - sideMargin,
  );
  const maxCardHeight = Math.max(220, screenHeight - cardTop - spacing.xl);
  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="none"
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

        <RNAnimated.View
          className="rounded-[24px] bg-background overflow-hidden"
          style={[
            styles.periodPickerCard,
            {
              left: cardLeft,
              top: cardTop,
              width: cardWidth,
              maxHeight: maxCardHeight,
              borderColor: withColorAlpha(themeColors.border, 0.45),
              shadowColor: themeColors.text,
              opacity: entrance,
              transform: [{ scale }],
              transformOrigin: 'top left',
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ paddingVertical: spacing.xs }}
          >
            {options.map((option) => {
              const isSelected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={cn(
                    'mx-2 flex-row items-center gap-3 rounded-2xl px-3 py-2.5',
                    isSelected ? 'bg-primary/10' : 'active:bg-secondary/40',
                  )}
                >
                  <View className="h-8 w-8 items-center justify-center">{option.icon}</View>
                  <Text numberOfLines={1} className="flex-1 text-foreground">
                    {option.label}
                  </Text>
                  {isSelected ? (
                    <Check size={16} color={themeColors.primary} />
                  ) : option.badge ? (
                    <View
                      className="items-center justify-center rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: themeColors.primary }}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          lineHeight: 10,
                          fontWeight: '700',
                          color: '#FFFFFF',
                          textAlign: 'center',
                        }}
                      >
                        {option.badge}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </RNAnimated.View>
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
    onScrollNearEnd,
  }: {
    item: number;
    pageData: InsightPageData;
    pageStyle: { width: number };
    isChartScrubbing: boolean;
    paneRenderVersion: string;
    getPageScrollRef: (index: number) => { current: ScrollView | null };
    renderInsightsPane: (pageData: InsightPageData) => React.ReactNode;
    onScrollNearEnd: (pageData: InsightPageData) => void;
  }) {
    const bottomNavInset = useBottomNavContentInset();
    const reportBottomNavScroll = useBottomNavScrollReporter();
    const contentStyle = useMemo(
      () => ({
        ...INSIGHTS_SCROLL_CONTENT_STYLE,
        paddingBottom: INSIGHTS_SCROLL_CONTENT_STYLE.paddingBottom + bottomNavInset,
      }),
      [bottomNavInset],
    );
    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        reportBottomNavScroll(event);
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 600) {
          onScrollNearEnd(pageData);
        }
      },
      [reportBottomNavScroll, onScrollNearEnd, pageData],
    );
    return (
      <View style={pageStyle} className="flex-1 bg-background">
        <ScrollView
          ref={(ref) => {
            getPageScrollRef(item).current = ref;
          }}
          className="flex-1"
          scrollEnabled={!isChartScrubbing}
          contentContainerStyle={contentStyle}
          onScroll={handleScroll}
          scrollEventThrottle={32}
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
    prev.renderInsightsPane === next.renderInsightsPane &&
    prev.onScrollNearEnd === next.onScrollNearEnd,
);

interface InsightsScreenProps {
  resetToCurrentMonthToken?: number;
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenProPaywall?: () => void;
  /** Budget view (embedded as an insights page via the type menu). */
  onOpenBudgetTemplates: () => void;
  onOpenBudgetTemplateEditor: (params?: { templateId?: string; duplicateFromId?: string }) => void;
  onOpenMonthlyBudgetEditor: (budgetId: string) => void;
  onCreateCustomBudget: (month: string) => void;
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
  onOpenProPaywall,
  onOpenBudgetTemplates,
  onOpenBudgetTemplateEditor,
  onOpenMonthlyBudgetEditor,
  onCreateCustomBudget,
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
    canUseTimeDisplayMode,
    getTrueHourlyRateForDate,
    getDisplayValueForTransaction,
    insightsPreferencesJson,
    updateInsightsPreferencesJson,
    simpleWalletId,
    monthlyWages,
    updateTransactionsBulk,
    deleteTransactionsBulk,
  } = useApp();
  const { transactions: liveTransactions } = useTransactions();
  // While the insights tab is hidden (it stays mounted behind the other tabs),
  // hold the last-seen snapshot so every write doesn't re-run the full insight
  // memo chain in the background; it catches up once when re-activated.
  const rawTransactions = useValueWhileTabVisible(liveTransactions);
  const { isPro } = usePro();
  const proTrendTypeSet = useMemo(() => new Set<string>(PRO_TREND_TYPES), []);

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
  const weekStartsOn = settings.weekStartsOn;

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
  const [filterCustomDateModalVisible, setFilterCustomDateModalVisible] = useState(false);
  const [selectedInsightType, setSelectedInsightType] = useState<InsightType>('expense_breakdown');
  const persistedPeriodPreset = clampPeriodPreset(
    selectedInsightType,
    periodPresetByInsight[selectedInsightType] ?? getDefaultPeriodPreset(selectedInsightType),
  );
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
  const [excludedExpenseBreakdownCategoryIds, setExcludedExpenseBreakdownCategoryIds] = useState<
    string[]
  >([]);
  const [excludedIncomeBreakdownCategoryIds, setExcludedIncomeBreakdownCategoryIds] = useState<
    string[]
  >([]);
  const [excludedAssetHistoryAccountIds, setExcludedAssetHistoryAccountIds] = useState<string[]>(
    () => accounts.filter((account) => !account.includeInTotals).map((account) => account.id),
  );
  const [excludedCategoryTrendAccountIds, setExcludedCategoryTrendAccountIds] = useState<string[]>(
    [],
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
  // Selected bar per category-trend period key (year number or 'lifetime').
  const [categoryTrendScrubBucketByPeriod, setCategoryTrendScrubBucketByPeriod] = useState<
    Record<string, string>
  >({});
  const [trendListVisibleCounts, setTrendListVisibleCounts] = useState<Record<string, number>>({});
  const [categoryTrendSelectedCategoryId, setCategoryTrendSelectedCategoryId] = useState<
    string | null
  >(null);
  const [isCategoryTrendPickerOpen, setIsCategoryTrendPickerOpen] = useState(false);
  const [activeInsightsFilterPicker, setActiveInsightsFilterPicker] = useState<
    | 'assetHistoryAccounts'
    | 'expenseTrendAccounts'
    | 'expenseTrendExpenseCategories'
    | 'incomeTrendAccounts'
    | 'incomeTrendIncomeCategories'
    | 'categoryTrendAccounts'
    | 'expenseBreakdownCategories'
    | 'incomeBreakdownCategories'
    | 'savingsIncomeCategories'
    | 'savingsExpenseCategories'
    | null
  >(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const closeInsightsFilterPicker = useCallback(() => setActiveInsightsFilterPicker(null), []);
  useEffect(() => {
    if (!isFilterModalOpen) setActiveInsightsFilterPicker(null);
  }, [isFilterModalOpen]);
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);
  const [periodPickerAnchorRect, setPeriodPickerAnchorRect] =
    useState<PeriodPickerAnchorRect | null>(null);
  const [isInsightMenuOpen, setIsInsightMenuOpen] = useState(false);
  // Budget rendered as an insights page: swaps the pager body and takes over
  // the header's month controls while active.
  const [isBudgetViewActive, setIsBudgetViewActive] = useState(false);
  const [budgetMonthLabel, setBudgetMonthLabel] = useState('');
  const budgetPagerRef = useRef<BudgetPagerViewHandle>(null);
  const [insightMenuAnchorRect, setInsightMenuAnchorRect] = useState<PeriodPickerAnchorRect | null>(
    null,
  );
  const [isChartScrubbing, setIsChartScrubbing] = useState(false);
  const breakdownHeaderDotPulse = useRef(new RNAnimated.Value(0)).current;
  const insightsTypeSelectorRef = useRef<View | null>(null);
  const periodPickerTriggerRef = useRef<View | null>(null);
  const expenseTrendScrubMonthByYearRef = useRef<Record<string, string>>(
    expenseTrendScrubMonthByYear,
  );
  const incomeTrendScrubMonthByYearRef = useRef<Record<string, string>>(
    incomeTrendScrubMonthByYear,
  );
  const assetHistoryScrubMonthByYearRef = useRef<Record<string, string>>(
    assetHistoryScrubMonthByYear,
  );
  const categoryTrendScrubBucketByPeriodRef = useRef<Record<string, string>>(
    categoryTrendScrubBucketByPeriod,
  );
  const lastScrubHapticAtRef = useRef(0);

  const { width, height } = useWindowDimensions();
  const bottomNavInset = useBottomNavContentInset();
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
  const visibleInsightTypes = isSimpleMode
    ? INSIGHT_TYPES.filter((t) => t !== 'asset_history')
    : INSIGHT_TYPES;
  const triggerScrubHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastScrubHapticAtRef.current < 72) return;
    lastScrubHapticAtRef.current = now;
    void triggerHaptic('selection');
  }, []);
  const insightTypeOptions = useMemo(() => {
    const options: {
      value: string;
      label: string;
      icon: React.ReactNode;
      badge?: string;
    }[] = visibleInsightTypes.map((type) => ({
      value: type,
      label: String(I18n.t(`insights.${type}`)),
      icon: renderInsightTypeIcon(type),
      badge: !isPro && proTrendTypeSet.has(type) ? String(I18n.t('pro.badge')) : undefined,
    }));
    // The budget view renders in place of the insight pager (it drives the
    // same header's month controls) rather than being an INSIGHT_TYPES entry.
    options.push({
      value: 'budget',
      label: String(I18n.t('budget.title')),
      icon: (
        <Image
          source={UTILITY_ICON_SOURCES['time-money']}
          resizeMode="contain"
          style={styles.insightTypeIconImage}
        />
      ),
    });
    return options;
  }, [visibleInsightTypes, isPro, proTrendTypeSet]);
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

  // Focus a specific insight when requested externally (e.g. the savings-rate
  // widget deep link: money2time://insights?focus=savings_rate). Consumes any
  // request that fired before this tab mounted, then listens for live ones.
  useEffect(() => {
    const focus = (insightType: string) => {
      if (!isInsightType(insightType)) return;
      setIsFilterModalOpen(false);
      setSelectedInsightType(insightType);
    };
    const pending = consumePendingFocusInsight();
    if (pending) focus(pending);
    return subscribeFocusInsightRequest(({ insightType }) => focus(insightType));
  }, []);

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
      if (saved.excludedExpenseBreakdownCategoryIds) {
        setExcludedExpenseBreakdownCategoryIds(saved.excludedExpenseBreakdownCategoryIds);
      }
      if (saved.excludedIncomeBreakdownCategoryIds) {
        setExcludedIncomeBreakdownCategoryIds(saved.excludedIncomeBreakdownCategoryIds);
      }
      if (saved.excludedCategoryTrendAccountIds) {
        setExcludedCategoryTrendAccountIds(saved.excludedCategoryTrendAccountIds);
      }
      if (Object.prototype.hasOwnProperty.call(saved, 'categoryTrendSelectedCategoryId')) {
        setCategoryTrendSelectedCategoryId(saved.categoryTrendSelectedCategoryId ?? null);
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
      excludedExpenseBreakdownCategoryIds,
      excludedIncomeBreakdownCategoryIds,
      excludedAssetHistoryAccountIds,
      excludedCategoryTrendAccountIds,
      categoryTrendSelectedCategoryId,
    }),
    [
      activeCustomDateField,
      anchorDate,
      categoryTrendSelectedCategoryId,
      customEnd,
      customStart,
      excludedExpenseTrendAccountIds,
      excludedExpenseTrendExpenseCategoryIds,
      excludedIncomeTrendAccountIds,
      excludedIncomeTrendIncomeCategoryIds,
      excludedAssetHistoryAccountIds,
      excludedCategoryTrendAccountIds,
      excludedSavingsExpenseCategoryIds,
      excludedSavingsIncomeCategoryIds,
      excludedExpenseBreakdownCategoryIds,
      excludedIncomeBreakdownCategoryIds,
      persistedPeriodPreset,
      periodPresetByInsight,
      selectedAccountIds,
      selectedInsightType,
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
  const categoryTrendCategoryOptions = useMemo<CategoryTrendCategoryOption[]>(
    () =>
      categories
        .filter((category) => category.type === 'expense' && category.parentId === null)
        .map((category) => ({
          id: category.id,
          label: category.name,
          emoji: resolveCategoryIcon(category.icon),
        })),
    [categories],
  );
  const defaultCategoryTrendCategoryId = useMemo<string | null>(() => {
    if (categoryTrendCategoryOptions.length === 0) return null;
    const totalsByRootId = new Map<string, number>();
    allTransactions.forEach((tx) => {
      if (tx.type !== 'expense' || !tx.categoryId) return;
      if (!Number.isFinite(tx.amount) || tx.amount <= 0) return;
      const category = categoryById.get(tx.categoryId);
      const rootId = category?.parentId ?? tx.categoryId;
      totalsByRootId.set(rootId, (totalsByRootId.get(rootId) ?? 0) + tx.amount);
    });
    let bestId: string | null = null;
    let bestAmount = -1;
    categoryTrendCategoryOptions.forEach((option) => {
      const amount = totalsByRootId.get(option.id) ?? 0;
      if (amount > bestAmount) {
        bestAmount = amount;
        bestId = option.id;
      }
    });
    return bestId ?? categoryTrendCategoryOptions[0]?.id ?? null;
  }, [allTransactions, categoryById, categoryTrendCategoryOptions]);
  const effectiveCategoryTrendCategoryId =
    categoryTrendSelectedCategoryId ?? defaultCategoryTrendCategoryId;
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
  const excludedCategoryTrendAccountSet = useMemo(
    () => new Set(excludedCategoryTrendAccountIds),
    [excludedCategoryTrendAccountIds],
  );
  const excludedExpenseBreakdownCategorySet = useMemo(
    () => new Set(excludedExpenseBreakdownCategoryIds),
    [excludedExpenseBreakdownCategoryIds],
  );
  const excludedIncomeBreakdownCategorySet = useMemo(
    () => new Set(excludedIncomeBreakdownCategoryIds),
    [excludedIncomeBreakdownCategoryIds],
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
          addAccountDelta(monthKey, account.id, transaction.amount);
        }
      }

      if (transaction.type === 'expense' && transaction.accountId) {
        const account = includedAssetHistoryAccountById.get(transaction.accountId);
        if (account) {
          addAccountDelta(monthKey, account.id, -transaction.amount);
        }
      }

      if (
        transaction.type === 'transfer' &&
        !isLegacyAdjustmentTransfer &&
        transaction.toAccountId
      ) {
        const account = includedAssetHistoryAccountById.get(transaction.toAccountId);
        if (account) {
          addAccountDelta(monthKey, account.id, transaction.amount);
        }
      }

      if (
        transaction.type === 'transfer' &&
        !isLegacyAdjustmentTransfer &&
        transaction.fromAccountId
      ) {
        const account = includedAssetHistoryAccountById.get(transaction.fromAccountId);
        if (account) {
          addAccountDelta(monthKey, account.id, -transaction.amount);
        }
      }

      if (
        (transaction.type === 'balance_adjustment' || isLegacyAdjustmentTransfer) &&
        transaction.accountId
      ) {
        const account = includedAssetHistoryAccountById.get(transaction.accountId);
        if (account) {
          addAccountDelta(
            monthKey,
            account.id,
            getNetAssetContribution(account.type, transaction.amount),
          );
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
  const hasCategoryTrendExclusionFilter = selectedInsightType === 'category_trend';
  const hasSavingsCategoryExclusionFilter = selectedInsightType === 'savings_rate';
  const hasExpenseBreakdownExclusionFilter = selectedInsightType === 'expense_breakdown';
  const hasIncomeBreakdownExclusionFilter = selectedInsightType === 'income_breakdown';
  const hasAssetHistoryAccountExclusionFilter = selectedInsightType === 'asset_history';
  const hasInsightsFilters =
    hasPeriodFilter ||
    hasAccountFilter ||
    hasExpenseTrendExclusionFilter ||
    hasIncomeTrendExclusionFilter ||
    hasCategoryTrendExclusionFilter ||
    hasSavingsCategoryExclusionFilter ||
    hasExpenseBreakdownExclusionFilter ||
    hasIncomeBreakdownExclusionFilter ||
    hasAssetHistoryAccountExclusionFilter;
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
        weekStartsOn,
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
        const isLifetime = periodPresetOverride === 'lifetime';
        const isYearPeriod = periodPresetOverride === 'year';
        const granularity: TrendGranularity = isLifetime ? 'year' : isYearPeriod ? 'month' : 'day';
        const periodKey = isLifetime
          ? 'lifetime'
          : isYearPeriod
            ? String(year)
            : `${range.start}|${range.end}`;

        const makeEmptyExpenseYearRow = (yearKey: string): ExpenseTrendMonthRow => ({
          monthKey: yearKey,
          axisLabel: yearKey,
          axisSubLabel: null,
          label: yearKey,
          totalExpense: 0,
          transactionCount: 0,
          topCategoryLabel: null,
          topCategoryEmoji: null,
          topCategoryAmount: 0,
          transactions: [],
        });

        let monthRowsSeed: ExpenseTrendMonthRow[];
        if (isLifetime) {
          monthRowsSeed = [];
        } else if (isYearPeriod) {
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
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isLifetime
            ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date)).slice(0, 4)
            : isYearPeriod
              ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date))
              : (transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date));
          let monthRow = monthRowByKey.get(rowKey);
          if (!monthRow) {
            if (!isLifetime) return;
            monthRow = makeEmptyExpenseYearRow(rowKey);
            monthRowByKey.set(rowKey, monthRow);
          }

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

        const orderedSeedRows = isLifetime
          ? fillLifetimeYearRows(monthRowByKey, makeEmptyExpenseYearRow)
          : monthRowsSeed;

        let peakMonthKey: string | null = null;
        let peakMonthExpense = 0;
        const monthRows = orderedSeedRows.map((row) => {
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
        const isLifetime = periodPresetOverride === 'lifetime';
        const isYearPeriod = periodPresetOverride === 'year';
        const granularity: TrendGranularity = isLifetime ? 'year' : isYearPeriod ? 'month' : 'day';
        const periodKey = isLifetime
          ? 'lifetime'
          : isYearPeriod
            ? String(year)
            : `${range.start}|${range.end}`;

        const makeEmptyIncomeYearRow = (yearKey: string): IncomeTrendMonthRow => ({
          monthKey: yearKey,
          axisLabel: yearKey,
          axisSubLabel: null,
          label: yearKey,
          totalIncome: 0,
          transactionCount: 0,
          topCategoryLabel: null,
          topCategoryEmoji: null,
          topCategoryAmount: 0,
          transactions: [],
        });

        let monthRowsSeed: IncomeTrendMonthRow[];
        if (isLifetime) {
          monthRowsSeed = [];
        } else if (isYearPeriod) {
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
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isLifetime
            ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date)).slice(0, 4)
            : isYearPeriod
              ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date))
              : (transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date));
          let monthRow = monthRowByKey.get(rowKey);
          if (!monthRow) {
            if (!isLifetime) return;
            monthRow = makeEmptyIncomeYearRow(rowKey);
            monthRowByKey.set(rowKey, monthRow);
          }

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

        const orderedSeedRows = isLifetime
          ? fillLifetimeYearRows(monthRowByKey, makeEmptyIncomeYearRow)
          : monthRowsSeed;

        let peakMonthKey: string | null = null;
        let peakMonthIncome = 0;
        const monthRows = orderedSeedRows.map((row) => {
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

      if (insightType === 'category_trend') {
        const year = state.anchorDate.getFullYear();
        const isLifetime = periodPresetOverride === 'lifetime';
        const isYearPeriod = periodPresetOverride === 'year';
        const granularity: TrendGranularity = isLifetime ? 'year' : isYearPeriod ? 'month' : 'day';
        const periodKey = isLifetime
          ? 'lifetime'
          : isYearPeriod
            ? String(year)
            : `${range.start}|${range.end}`;
        const selectedCategoryId = effectiveCategoryTrendCategoryId;

        const makeEmptyCategoryYearRow = (yearKey: string): ExpenseTrendMonthRow => ({
          monthKey: yearKey,
          axisLabel: yearKey,
          axisSubLabel: null,
          label: yearKey,
          totalExpense: 0,
          transactionCount: 0,
          topCategoryLabel: null,
          topCategoryEmoji: null,
          topCategoryAmount: 0,
          transactions: [],
        });

        let monthRowsSeed: ExpenseTrendMonthRow[];
        if (isLifetime) {
          monthRowsSeed = [];
        } else if (isYearPeriod) {
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
            axisLabel: dayNumberLabel(dk),
            axisSubLabel: null,
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
        const filteredForRange: TransactionWithRelations[] = [];

        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense' || !tx.categoryId || !selectedCategoryId) return;
          if (tx.accountId && excludedCategoryTrendAccountSet.has(tx.accountId)) return;
          const category = categoryById.get(tx.categoryId);
          const rootCategoryId = category?.parentId ?? tx.categoryId;
          if (rootCategoryId !== selectedCategoryId) return;

          const value =
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isLifetime
            ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date)).slice(0, 4)
            : isYearPeriod
              ? (transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date))
              : (transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date));
          let monthRow = monthRowByKey.get(rowKey);
          if (!monthRow) {
            if (!isLifetime) return;
            monthRow = makeEmptyCategoryYearRow(rowKey);
            monthRowByKey.set(rowKey, monthRow);
          }

          filteredForRange.push(tx);
          monthRow.totalExpense += value;
          monthRow.transactionCount += 1;
          monthRow.transactions.push(tx);
        });

        const orderedSeedRows = isLifetime
          ? fillLifetimeYearRows(monthRowByKey, makeEmptyCategoryYearRow)
          : monthRowsSeed;

        // Sort each bucket's transactions newest-first so the selected-bucket
        // list renders without re-sorting on every render (page data is cached).
        const monthRows = orderedSeedRows.map((row) => {
          if (row.transactions.length < 2) return row;
          return {
            ...row,
            transactions: row.transactions.sort((a, b) => {
              const dateDelta = b.date.localeCompare(a.date);
              if (dateDelta !== 0) return dateDelta;
              return b.createdAt.localeCompare(a.createdAt);
            }),
          };
        });

        // Sort once here (page data is cached) so the pane can slice for the
        // infinite-scroll list without re-sorting on every render.
        if (filteredForRange.length > 1) {
          filteredForRange.sort((a, b) => {
            const dateDelta = b.date.localeCompare(a.date);
            if (dateDelta !== 0) return dateDelta;
            return b.createdAt.localeCompare(a.createdAt);
          });
        }

        return {
          kind: 'category_trend',
          year,
          periodKey,
          granularity,
          range,
          filteredForRange,
          monthRows,
          selectedCategoryId,
          selectableCategories: categoryTrendCategoryOptions,
        };
      }

      if (insightType === 'expense_sentiment') {
        const isYearView = periodPresetOverride === 'year';
        const filteredForRange: TransactionWithRelations[] = [];
        const totals = { happy: 0, neutral: 0, sad: 0 };

        if (isYearView) {
          const year = state.anchorDate.getFullYear();
          const monthLabels = monthLabelsForYear(year, activeLocale);
          const rowByKey = new Map<string, SentimentDayRow>();
          const monthKeys = Array.from({ length: 12 }, (_, monthIndex) => {
            const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
            rowByKey.set(key, {
              dayKey: key,
              label: monthLabels[monthIndex] ?? '',
              subLabel: null,
              happy: 0,
              neutral: 0,
              sad: 0,
              total: 0,
            });
            return key;
          });

          inRangeTransactions.forEach((tx) => {
            if (tx.type !== 'expense') return;
            const monthKey = transactionMonthKeyById.get(tx.id) ?? monthKeyFromIsoLocal(tx.date);
            const row = rowByKey.get(monthKey);
            if (!row) return;
            filteredForRange.push(tx);
            const sentiment = tx.sentiment ?? 'neutral';
            row[sentiment] += 1;
            row.total += 1;
            totals[sentiment] += 1;
          });

          return {
            kind: 'expense_sentiment',
            range,
            filteredForRange,
            dayRows: monthKeys.map((key) => rowByKey.get(key)!),
            totals,
          };
        }

        const dayKeys = generateDayKeysForRange(range.start, range.end);
        const useDetailedDayLabels = dayKeys.length <= 7;
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
          (sum, account) => sum + getNetAssetContribution(account.type, account.startingBalance),
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
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
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

      const transactionType = transactionTypeFromInsightType(insightType);
      const breakdownExclusionSet =
        transactionType === 'expense'
          ? excludedExpenseBreakdownCategorySet
          : excludedIncomeBreakdownCategorySet;
      const filteredForRange: TransactionWithRelations[] = [];
      const breakdownTotals = new Map<
        string,
        { id: string; label: string; amount: number; count: number; emoji: string }
      >();
      const breakdownTransactionsById = new Map<string, TransactionWithRelations[]>();
      inRangeTransactions.forEach((tx) => {
        if (tx.type !== transactionType) return;
        if (breakdownExclusionSet.size > 0 && tx.categoryId) {
          const category = categoryById.get(tx.categoryId);
          const rootId = category?.parentId ?? tx.categoryId;
          if (breakdownExclusionSet.has(tx.categoryId) || breakdownExclusionSet.has(rootId)) {
            return;
          }
        }
        filteredForRange.push(tx);

        const id = resolveBreakdownRootId(tx, categoryById);
        const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
        const root = category?.parentId ? categoryById.get(category.parentId) : category;
        const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
        const label = String(root?.name ?? fallbackRootLabel ?? I18n.t('common.uncategorized'));
        const emoji = root?.icon ?? tx.categoryIcon ?? '•';
        const value =
          settings.displayMode === 'time'
            ? getDisplayValueForTransaction(tx)
            : (tx.reportingAmount ?? tx.amount);

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
      const categoryRows = Array.from(breakdownTotals.values()).sort((a, b) => b.amount - a.amount);
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
      categoryTrendCategoryOptions,
      effectiveCategoryTrendCategoryId,
      excludedExpenseTrendAccountSet,
      excludedExpenseTrendExpenseCategorySet,
      excludedIncomeTrendAccountSet,
      excludedIncomeTrendIncomeCategorySet,
      excludedSavingsExpenseCategorySet,
      excludedSavingsIncomeCategorySet,
      excludedExpenseBreakdownCategorySet,
      excludedIncomeBreakdownCategorySet,
      excludedCategoryTrendAccountSet,
      getTrueHourlyRateForDate,
      getDisplayValueForTransaction,
      includedAssetHistoryAccounts,
      activeLocale,
      settings.displayMode,
      transactionDayKeyById,
      transactionMonthKeyById,
      weekStartsOn,
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
      // A non-Pro user only sees the paywall overlay for locked trends, so skip
      // the expensive per-period series build entirely and hand back the stable
      // empty shell. This is the cold-start freeze fix: the pager builds data
      // for its whole window on the restored insight, and for a large imported
      // history that build (× several pages) blocked the JS thread for seconds.
      if (!isPro && proTrendTypeSet.has(insightType)) {
        return LOCKED_TREND_PLACEHOLDERS[insightType as ProTrendType];
      }
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
    [buildPageData, isPro, proTrendTypeSet],
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
        weekStartsOn,
      ),
    [displayPeriodPreset, headerPreviewPeriodState, weekStartsOn],
  );
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
  // Prominent total for the bar the user is scrubbing on a trend chart. Mirrors
  // the breakdown "total on top" styling so the two insight families read alike.
  const renderTrendBucketTotal = useCallback(
    (totalValue: number, accentColor: string) => (
      <View className="items-center gap-0.5 py-1">
        {renderValueNode(totalValue, {
          variant: 'heading',
          textClassName: 'text-[24px] leading-[38px] font-black tracking-tight',
          style: { color: accentColor },
          containerClassName: 'justify-center',
          iconColor: accentColor,
          iconSize: 22,
        })}
        <View
          style={{
            width: 36,
            height: 3,
            borderRadius: 2,
            backgroundColor: withColorAlpha(accentColor, isDark ? 0.38 : 0.28),
            marginTop: 1,
          }}
        />
      </View>
    ),
    [isDark, renderValueNode],
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
    expenseTrendScrubMonthByYearRef.current = expenseTrendScrubMonthByYear;
  }, [expenseTrendScrubMonthByYear]);
  useEffect(() => {
    incomeTrendScrubMonthByYearRef.current = incomeTrendScrubMonthByYear;
  }, [incomeTrendScrubMonthByYear]);
  useEffect(() => {
    assetHistoryScrubMonthByYearRef.current = assetHistoryScrubMonthByYear;
  }, [assetHistoryScrubMonthByYear]);
  useEffect(() => {
    categoryTrendScrubBucketByPeriodRef.current = categoryTrendScrubBucketByPeriod;
  }, [categoryTrendScrubBucketByPeriod]);
  useEffect(() => {
    unlockChartScrub();
  }, [selectedInsightType, unlockChartScrub]);
  useEffect(() => () => unlockChartScrub(), [unlockChartScrub]);

  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(breakdownHeaderDotPulse, {
          toValue: 1,
          duration: 820,
          useNativeDriver: true,
        }),
        RNAnimated.timing(breakdownHeaderDotPulse, {
          toValue: 0,
          duration: 820,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => {
      pulse.stop();
      breakdownHeaderDotPulse.stopAnimation();
      breakdownHeaderDotPulse.setValue(0);
    };
  }, [breakdownHeaderDotPulse]);

  const setActiveBreakdownSlice = useCallback((nextId: string | null, withHaptic = false) => {
    if (activeBreakdownSliceIdRef.current === nextId) return;
    activeBreakdownSliceIdRef.current = nextId;
    setActiveBreakdownSliceId(nextId);
    if (withHaptic && nextId) {
      void triggerHaptic('selection');
    }
  }, []);

  const renderBreakdownPane = (pageData: BreakdownPageData) => {
    type BreakdownPieSlice = {
      id: string;
      name: string;
      amount: number;
      value: number;
      emoji: string;
      pct: number;
      color: string;
    };

    const isIncomeBreakdown = pageData.transactionType === 'income';
    const noPositiveSlicesMessage = isIncomeBreakdown
      ? I18n.t('insights.no_positive_income_slices')
      : I18n.t('insights.no_positive_slices');
    const breakdownVisual = isIncomeBreakdown
      ? INSIGHT_TYPE_VISUALS.income_breakdown
      : INSIGHT_TYPE_VISUALS.expense_breakdown;
    const totalRowAccentColor = breakdownVisual.tint;
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
      value: row.amount,
      emoji: row.emoji || categoryById.get(row.id)?.icon || '•',
      pct: pageTotalAmount > 0 ? (row.amount / pageTotalAmount) * 100 : 0,
      color: INSIGHTS_CHART_COLORS[i % INSIGHTS_CHART_COLORS.length],
    })) satisfies BreakdownPieSlice[];
    const activeSlice = activeBreakdownSliceId
      ? (pagePieData.find((item) => item.id === activeBreakdownSliceId) ?? null)
      : null;
    const pieLayoutBleed = Math.max(24, spacing.screenHorizontal * 2);
    const pieSideMargin = 14;
    const pieLayoutWidth = Math.max(chartWidth, pageWidth + pieLayoutBleed - pieSideMargin * 2);
    const pieLabelWidth = Math.max(
      BREAKDOWN_PIE_LABEL_MIN_WIDTH,
      Math.min(BREAKDOWN_PIE_LABEL_MAX_WIDTH, Math.floor(pieLayoutWidth * 0.25)),
    );
    const pieLabelMaxChars = Math.max(7, Math.min(13, Math.floor((pieLabelWidth - 14) / 5)));
    const pieExtraRadius =
      pieLabelWidth + BREAKDOWN_PIE_LABEL_LINE_LENGTH + BREAKDOWN_PIE_LABEL_MARGIN + 6;
    const pieRadius = Math.max(
      BREAKDOWN_PIE_MIN_RADIUS,
      Math.min(BREAKDOWN_PIE_MAX_RADIUS, Math.floor((pieLayoutWidth - pieExtraRadius * 2) / 2)),
    );
    const pieStageWidth = (pieRadius + pieExtraRadius) * 2;
    // Crop top/bottom: labels sit in left/right columns, so the full square isn't needed.
    const pieStageHeight = Math.max(
      pieRadius * 2 + 24,
      pieStageWidth - Math.min(140, Math.max(92, pieExtraRadius * 1.2)),
    );
    const pieStageVerticalInset = Math.max(0, Math.floor((pieStageWidth - pieStageHeight) / 2));
    const pieLabelStyleById = new Map<
      string,
      {
        categoryLabel: string;
        labelIconSource: ReturnType<typeof resolveCategoryIconSource>;
        labelStroke: string;
        labelTextColor: string;
        lineThickness: number;
        emoji: string;
        pct: number;
        dimmed: boolean;
      }
    >();
    const interactivePieData = pagePieData.map((item) => {
      const isSelected = activeSlice?.id === item.id;
      const hasSelection = activeSlice !== null;
      const categoryLabel =
        item.name.length <= pieLabelMaxChars
          ? item.name
          : `${item.name.slice(0, Math.max(1, pieLabelMaxChars - 3)).trimEnd()}...`;
      const labelIconSource = resolveCategoryIconSource(item.emoji);
      const sliceColor =
        hasSelection && !isSelected ? withColorAlpha(item.color, 0.28) : item.color;
      const labelStroke = isSelected
        ? withColorAlpha(item.color, 0.72)
        : hasSelection
          ? withColorAlpha(item.color, 0.18)
          : withColorAlpha(item.color, isDark ? 0.46 : 0.28);
      const labelTextColor =
        hasSelection && !isSelected ? withColorAlpha(themeColors.text, 0.62) : themeColors.text;
      pieLabelStyleById.set(item.id, {
        categoryLabel,
        labelIconSource,
        labelStroke,
        labelTextColor,
        lineThickness: isSelected ? 1.7 : 1.2,
        emoji: item.emoji,
        pct: item.pct,
        dimmed: hasSelection && !isSelected,
      });
      return {
        ...item,
        color: sliceColor,
      };
    });
    const pieLabels = layoutBreakdownPieLabels(pagePieData, {
      cx: pieStageWidth / 2,
      cy: pieStageWidth / 2 - pieStageVerticalInset,
      radius: pieRadius,
      elbowLength: BREAKDOWN_PIE_LABEL_LINE_LENGTH,
      tailLength: BREAKDOWN_PIE_LABEL_TAIL_LENGTH,
      labelWidth: pieLabelWidth,
      labelHeight: BREAKDOWN_PIE_LABEL_HEIGHT,
      labelGap: BREAKDOWN_PIE_LABEL_HEIGHT + BREAKDOWN_PIE_LABEL_MARGIN,
      stageHeight: pieStageHeight,
      totalAmount: pageTotalAmount,
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
      <View className="gap-1">
        <View className="items-center px-1">
          <View className="w-full items-center gap-0.5 py-1">
            {renderValueNode(pageTotalAmount, {
              variant: 'heading',
              textClassName: 'text-[24px] leading-[38px] font-black tracking-tight',
              style: { color: totalRowAccentColor },
              containerClassName: 'justify-center',
              iconColor: totalRowAccentColor,
              iconSize: 22,
            })}
            <View
              style={{
                width: 36,
                height: 3,
                borderRadius: 2,
                backgroundColor: withColorAlpha(totalRowAccentColor, isDark ? 0.38 : 0.28),
                marginTop: 1,
              }}
            />
          </View>

          <View className="mt-2 w-full items-center overflow-visible">
            {pagePieData.length > 0 ? (
              <View className="w-full items-center" style={styles.chartSizeCenter}>
                <View
                  style={buildSizeStyle(pieStageWidth, pieStageHeight)}
                  onStartShouldSetResponder={() => true}
                  onResponderRelease={(event) => {
                    const { locationX, locationY } = event.nativeEvent;
                    const nextId = pieSliceIdFromTouch(
                      {
                        x: locationX - pieExtraRadius,
                        y: locationY + pieStageVerticalInset - pieExtraRadius,
                      },
                      pagePieData,
                      pageTotalAmount,
                      pieRadius,
                    );
                    if (!nextId) {
                      setActiveBreakdownSlice(null, false);
                      return;
                    }
                    if (activeBreakdownSliceId === nextId) return;
                    setActiveBreakdownSlice(nextId, true);
                  }}
                >
                  <View pointerEvents="none" style={{ marginTop: -pieStageVerticalInset }}>
                    <PieChart
                      data={interactivePieData}
                      radius={pieRadius}
                      extraRadius={pieExtraRadius}
                    />
                  </View>
                  <Svg
                    pointerEvents="none"
                    width={pieStageWidth}
                    height={pieStageHeight}
                    style={StyleSheet.absoluteFill}
                  >
                    {pieLabels.map((label) => {
                      const style = pieLabelStyleById.get(label.id);
                      if (!style) return null;
                      return (
                        <G key={label.id} opacity={style.dimmed ? 0.72 : 1}>
                          <Polyline
                            points={`${label.anchorX},${label.anchorY} ${label.outerX},${label.outerY} ${label.innerX},${label.labelY}`}
                            fill="none"
                            stroke={style.labelStroke}
                            strokeWidth={style.lineThickness}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          <G x={label.boxLeft} y={label.labelY}>
                            {style.labelIconSource ? (
                              <SvgImage
                                href={style.labelIconSource}
                                x={pieLabelWidth / 2 - 7}
                                y={-16}
                                width={14}
                                height={14}
                                preserveAspectRatio="xMidYMid meet"
                              />
                            ) : null}
                            <SvgText
                              x={pieLabelWidth / 2}
                              y={style.labelIconSource ? 3 : -4}
                              textAnchor="middle"
                              alignmentBaseline="middle"
                              fontSize={9.2}
                              fontFamily={FONT.bold}
                              fontWeight="700"
                              fill={style.labelTextColor}
                            >
                              {style.labelIconSource
                                ? style.categoryLabel
                                : `${style.emoji} ${style.categoryLabel}`}
                            </SvgText>
                            <SvgText
                              x={pieLabelWidth / 2}
                              y={style.labelIconSource ? 13 : 8}
                              textAnchor="middle"
                              alignmentBaseline="middle"
                              fontSize={8}
                              fontFamily={FONT.semibold}
                              fontWeight="600"
                              fill={withColorAlpha(style.labelTextColor, isDark ? 0.75 : 0.55)}
                            >
                              {`${style.pct.toFixed(1)}%`}
                            </SvgText>
                          </G>
                        </G>
                      );
                    })}
                  </Svg>
                </View>
              </View>
            ) : (
              <View className="rounded-[16px] bg-secondary/45 border border-border/30 px-4 py-3">
                <Text variant="label" tone="muted">
                  {noPositiveSlicesMessage}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="gap-1.5">
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
                  <View className="flex-1 flex-row items-center gap-1.5 pr-2">
                    <CategoryEmoji icon={item.emoji} size={16} />
                    <Text variant="caption" className="flex-1" numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    {renderValueNode(item.amount, {
                      variant: 'label',
                      textClassName: 'text-foreground',
                      iconColor: themeColors.text,
                    })}
                    <View
                      className="rounded-full px-1.5 py-0.5"
                      style={[styles.breakdownPercentBadge, { backgroundColor: percentBadgeColor }]}
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

    const monthValues = pageData.monthRows.map((row) => row.totalExpense);
    const expenseGraphWidth = Math.max(140, lineChartWidth - EXPENSE_TREND_CHART_PADDING_RIGHT);
    const expenseAxisTicks = buildGraphAxisTicks(monthValues, EXPENSE_TREND_CHART_HEIGHT);
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
      <View className="gap-3">
        {renderTrendBucketTotal(selectedMonthRow.totalExpense, trendAccentColor)}
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

        <TrendMonthTransactions
          key={`expense-${selectedMonthRow.monthKey}`}
          transactions={selectedMonthRow.transactions}
          visibleCount={
            trendListVisibleCounts[`expense|${pageData.periodKey}|${selectedMonthRow.monthKey}`] ??
            TREND_TRANSACTIONS_INITIAL_EXPENSE_INCOME
          }
          locale={activeLocale}
          displaySettings={settings}
          getDisplayValueForTransaction={getDisplayValueForTransaction}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          onOpenTransaction={handleTransactionPress}
          onTransactionLongPress={handleTransactionLongPress}
          selectedTransactionIds={selectedTransactionIds}
          selectionMode={isSelectionMode}
          emptyTitle={I18n.t('insights.analytics.expense_trend.no_data_title')}
          emptyMessage={I18n.t('insights.analytics.expense_trend.no_data_message')}
        />
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

    const monthValues = pageData.monthRows.map((row) => row.totalIncome);
    const incomeGraphWidth = Math.max(140, lineChartWidth - EXPENSE_TREND_CHART_PADDING_RIGHT);
    const incomeAxisTicks = buildGraphAxisTicks(monthValues, EXPENSE_TREND_CHART_HEIGHT);
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
      <View className="gap-3">
        {renderTrendBucketTotal(selectedMonthRow.totalIncome, trendAccentColor)}
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

        <TrendMonthTransactions
          key={`income-${selectedMonthRow.monthKey}`}
          transactions={selectedMonthRow.transactions}
          visibleCount={
            trendListVisibleCounts[`income|${pageData.periodKey}|${selectedMonthRow.monthKey}`] ??
            TREND_TRANSACTIONS_INITIAL_EXPENSE_INCOME
          }
          locale={activeLocale}
          displaySettings={settings}
          getDisplayValueForTransaction={getDisplayValueForTransaction}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          onOpenTransaction={handleTransactionPress}
          onTransactionLongPress={handleTransactionLongPress}
          selectedTransactionIds={selectedTransactionIds}
          selectionMode={isSelectionMode}
          emptyTitle={I18n.t('insights.analytics.income_trend.no_data_title')}
          emptyMessage={I18n.t('insights.analytics.income_trend.no_data_message')}
        />
      </View>
    );
  };

  const renderCategoryTrendPane = (pageData: CategoryTrendPageData) => {
    const trendAccentColor = INSIGHT_TYPE_VISUALS.category_trend.tint;

    if (pageData.filteredForRange.length === 0) {
      return (
        <View className="mt-2 gap-3">
          <EmptyState
            title={I18n.t('insights.analytics.category_trend.no_data_title')}
            message={I18n.t('insights.analytics.category_trend.no_data_message')}
            mascotMood="curious"
            animateIn={false}
          />
        </View>
      );
    }

    const selectedPeriodKey = pageData.periodKey;
    const selectedBucketKey = categoryTrendScrubBucketByPeriod[selectedPeriodKey] ?? null;
    const fallbackSelectedRow =
      [...pageData.monthRows].reverse().find((row) => row.totalExpense > 0) ??
      pageData.monthRows[pageData.monthRows.length - 1] ??
      null;
    const selectedRow =
      pageData.monthRows.find((row) => row.monthKey === selectedBucketKey) ?? fallbackSelectedRow;
    if (!selectedRow) return null;

    const monthValues = pageData.monthRows.map((row) => row.totalExpense);
    const categoryGraphWidth = Math.max(140, lineChartWidth - CATEGORY_TREND_CHART_PADDING_RIGHT);
    const categoryAxisTicks = buildGraphAxisTicks(monthValues, CATEGORY_TREND_CHART_HEIGHT);
    const selectCategoryTrendBucket = (bucketKey: string) => {
      if (categoryTrendScrubBucketByPeriodRef.current[selectedPeriodKey] === bucketKey) return;
      triggerScrubHaptic();
      categoryTrendScrubBucketByPeriodRef.current = {
        ...categoryTrendScrubBucketByPeriodRef.current,
        [selectedPeriodKey]: bucketKey,
      };
      setCategoryTrendScrubBucketByPeriod((previous) => {
        if (previous[selectedPeriodKey] === bucketKey) return previous;
        return { ...previous, [selectedPeriodKey]: bucketKey };
      });
    };

    return (
      <View className="gap-3">
        {renderTrendBucketTotal(selectedRow.totalExpense, trendAccentColor)}
        <View style={lineChartSectionStyle} className="py-1">
          <View
            style={[
              styles.chartSizeCenter,
              buildSizeStyle(lineChartWidth, CATEGORY_TREND_CHART_HEIGHT),
            ]}
            onTouchStart={lockChartScrub}
            onTouchEnd={unlockChartScrub}
            onTouchCancel={unlockChartScrub}
          >
            <GraphYAxisGrid
              ticks={categoryAxisTicks}
              chartWidth={categoryGraphWidth}
              chartHeight={CATEGORY_TREND_CHART_HEIGHT}
              labelWidth={CATEGORY_TREND_CHART_PADDING_RIGHT}
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
              chartWidth={categoryGraphWidth}
              chartHeight={CATEGORY_TREND_CHART_HEIGHT}
              primaryColor={trendAccentColor}
              averageValue={0}
              referenceColor={trendAccentColor}
              selectedMonthKey={selectedRow.monthKey}
              onSelectMonthKey={selectCategoryTrendBucket}
              onGestureStart={lockChartScrub}
              onGestureEnd={unlockChartScrub}
              labelColor={themeColors.textMuted}
              gridLineColor={withColorAlpha(themeColors.border, isDark ? 0.5 : 0.42)}
            />
          </View>
        </View>

        <TrendMonthTransactions
          key={`category-${selectedRow.monthKey}`}
          transactions={selectedRow.transactions}
          visibleCount={
            trendListVisibleCounts[`category|${selectedPeriodKey}|${selectedRow.monthKey}`] ??
            TREND_TRANSACTIONS_INITIAL
          }
          locale={activeLocale}
          displaySettings={settings}
          getDisplayValueForTransaction={getDisplayValueForTransaction}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          onOpenTransaction={handleTransactionPress}
          onTransactionLongPress={handleTransactionLongPress}
          selectedTransactionIds={selectedTransactionIds}
          selectionMode={isSelectionMode}
          emptyTitle={I18n.t('insights.analytics.category_trend.no_data_title')}
          emptyMessage={I18n.t('insights.analytics.category_trend.no_data_message')}
        />
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
              <Text
                variant="label"
                style={{ color: themeColors.primary, fontFamily: FONT.semibold, fontWeight: '600' }}
              >
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

  const renderAnalyticsPane = (pageData: AnalyticsPageData) => {
    if (pageData.insightType === 'savings_rate') {
      const savingsRate =
        pageData.totalIncome > 0 ? pageData.totalNet / pageData.totalIncome : null;
      const displayRatePercent =
        savingsRate === null ? null : Number((savingsRate * 100).toFixed(1));
      const {
        color: toneColor,
        Icon: StatusIcon,
        labelKey: statusLabelKey,
      } = resolveSavingsRateStatus(displayRatePercent, themeColors);
      const statusLabel = I18n.t(`insights.analytics.savings_rate.${statusLabelKey}`);
      const statusChipColor = withColorAlpha(toneColor, isDark ? 0.24 : 0.14);
      const formattedSavingsRate =
        displayRatePercent === null ? null : formatSavingsRatePercentLabel(displayRatePercent);
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
      const ringTrackColor = withColorAlpha(themeColors.textMuted, isDark ? 0.26 : 0.16);
      const monthTrackSpentColor = withColorAlpha(themeColors.error, isDark ? 0.32 : 0.16);
      const monthTrackIdleColor = withColorAlpha(themeColors.textMuted, isDark ? 0.24 : 0.14);
      const piggyIconSource = UTILITY_ICON_SOURCES[INSIGHT_TYPE_ICON_NAME.savings_rate];
      let bestMonthKey: string | null = null;
      let bestMonthRate = 0;
      pageData.savingsRateRows.forEach((row) => {
        if (row.savingsRate !== null && row.savingsRate > bestMonthRate) {
          bestMonthKey = row.monthKey;
          bestMonthRate = row.savingsRate;
        }
      });

      return (
        <View className="mt-2 gap-3">
          <Card className="gap-4 p-5">
            <View className="flex-row items-center gap-4">
              <SavingsRateRing
                size={SAVINGS_RATE_RING_SIZE}
                strokeWidth={SAVINGS_RATE_RING_STROKE_WIDTH}
                progress={savingsRate ?? 0}
                color={toneColor}
                trackColor={ringTrackColor}
                goal={HEALTHY_SAVINGS_RATE_THRESHOLD}
                goalColor={themeColors.accent}
              >
                {piggyIconSource ? (
                  <Image
                    source={piggyIconSource}
                    resizeMode="contain"
                    style={styles.savingsRateRingIcon}
                  />
                ) : (
                  <PiggyBank size={36} color={toneColor} strokeWidth={1.8} />
                )}
              </SavingsRateRing>

              <View className="flex-1">
                <View className="mt-0.5">
                  {formattedSavingsRate === null ? (
                    <Text variant="monoLg" tone="muted">
                      {I18n.t('insights.analytics.savings_rate.no_income_short')}
                    </Text>
                  ) : (
                    // The gradient number is SVG glyphs, invisible to screen
                    // readers — announce the figure on the wrapper instead.
                    <View
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={formattedSavingsRate}
                    >
                      <GradientPercent
                        label={formattedSavingsRate}
                        color={toneColor}
                        gradientId="insightsSavingsRateHero"
                      />
                    </View>
                  )}
                </View>
                {savingsRate !== null ? (
                  <Text variant="caption" tone="muted">
                    {I18n.t('widgets.of_income_saved')}
                  </Text>
                ) : null}
                <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                  <View
                    className="flex-row items-center gap-1 rounded-full px-2 py-[3px]"
                    style={{ backgroundColor: statusChipColor }}
                  >
                    <StatusIcon size={11} color={toneColor} strokeWidth={2.6} />
                    <Text
                      variant="label"
                      style={{ color: toneColor, fontFamily: FONT.semibold, fontWeight: '600' }}
                    >
                      {statusLabel}
                    </Text>
                  </View>
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
              </View>
            </View>

            <View className="flex-row items-stretch border-t border-border/40 pt-3">
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-success" />
                  <Text variant="label" tone="muted">
                    {I18n.t('calendar.income')}
                  </Text>
                </View>
                {renderCompactValueNode(pageData.totalIncome, {
                  variant: 'caption',
                  textClassName: 'mt-0.5 text-success',
                  iconColor: themeColors.success,
                })}
              </View>
              <View className="mx-3 w-px bg-border/40" />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  <Text variant="label" tone="muted">
                    {I18n.t('calendar.expense')}
                  </Text>
                </View>
                {renderCompactValueNode(pageData.totalExpense, {
                  variant: 'caption',
                  textClassName: 'mt-0.5 text-destructive',
                  iconColor: themeColors.error,
                })}
              </View>
              <View className="mx-3 w-px bg-border/40" />
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <View
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      pageData.totalNet >= 0 ? 'bg-success' : 'bg-destructive',
                    )}
                  />
                  <Text variant="label" tone="muted">
                    {I18n.t('calendar.net')}
                  </Text>
                </View>
                {renderCompactValueNode(Math.abs(pageData.totalNet), {
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
              const hasActivity =
                row.transactions.length > 0 || row.income !== 0 || row.expense !== 0;
              if (!hasActivity) {
                return (
                  <View
                    key={row.monthKey}
                    className="flex-row items-center justify-between rounded-2xl border border-dashed border-border/40 px-3 py-2 opacity-60"
                  >
                    <Text variant="caption" tone="muted">
                      {row.label}
                    </Text>
                    <Text variant="caption" tone="muted">
                      —
                    </Text>
                  </View>
                );
              }

              const monthlySavedAmount = Math.abs(row.net);
              const monthlyDisplayPercent =
                monthlyRate === null ? null : Number((monthlyRate * 100).toFixed(1));
              const monthlyRateLabel =
                monthlyDisplayPercent === null
                  ? '—'
                  : formatSavingsRatePercentLabel(monthlyDisplayPercent);
              const monthlySavedAmountClass =
                row.net > 0
                  ? 'text-success'
                  : row.net < 0
                    ? 'text-destructive'
                    : 'text-muted-foreground';
              const monthlyFillFraction =
                monthlyRate === null ? 0 : Math.max(0, Math.min(1, monthlyRate));
              const monthlyToneColor = resolveSavingsRateStatus(
                monthlyDisplayPercent,
                themeColors,
              ).color;
              const isBestMonth = row.monthKey === bestMonthKey;
              return (
                <Pressable
                  key={row.monthKey}
                  onPress={() => {
                    openDrilldown({
                      label: row.label,
                      transactions: row.transactions,
                      showTypeFilter: true,
                      triggerSelectionHaptic: true,
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                  className="rounded-2xl border border-border/30 bg-card px-3.5 py-3 active:opacity-85"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="w-11">
                      <View className="flex-row items-center gap-1">
                        <Text variant="caption" numberOfLines={1}>
                          {row.label}
                        </Text>
                        {isBestMonth ? <Sparkles size={10} color={themeColors.accent} /> : null}
                      </View>
                    </View>
                    <View className="flex-1 gap-2">
                      <View
                        className="h-2 overflow-hidden rounded-full"
                        style={{
                          backgroundColor:
                            row.income > 0 || row.expense > 0
                              ? monthTrackSpentColor
                              : monthTrackIdleColor,
                        }}
                      >
                        <View
                          style={[
                            styles.progressFill,
                            buildWidthStyle(`${Math.round(monthlyFillFraction * 100)}%`),
                            { backgroundColor: themeColors.success },
                          ]}
                        />
                        {row.income > 0 ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.savingsRateHealthyMarker,
                              buildLeftStyle(healthyMarkerLeft),
                              { backgroundColor: healthyMarkerColor },
                            ]}
                          />
                        ) : null}
                      </View>
                      <View className="flex-row items-center justify-between gap-2">
                        {renderCompactValueNode(row.income, {
                          variant: 'label',
                          textClassName: 'text-success/90',
                          iconColor: themeColors.success,
                        })}
                        {renderCompactValueNode(row.expense, {
                          variant: 'label',
                          textClassName: 'text-destructive/90',
                          iconColor: themeColors.error,
                        })}
                      </View>
                    </View>
                    <View className="w-20 items-end gap-0.5">
                      <Text variant="mono" numberOfLines={1} style={{ color: monthlyToneColor }}>
                        {monthlyRateLabel}
                      </Text>
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
    if (!isPro && proTrendTypeSet.has(pageData.kind)) {
      return <ProTrendPreviewOverlay onUpgrade={handleTrendUpgrade} />;
    }
    if (pageData.kind === 'expense_trend') {
      return renderExpenseTrendPane(pageData);
    }
    if (pageData.kind === 'income_trend') {
      return renderIncomeTrendPane(pageData);
    }
    if (pageData.kind === 'category_trend') {
      return renderCategoryTrendPane(pageData);
    }
    if (pageData.kind === 'expense_sentiment') {
      return renderExpenseSentimentPane(pageData);
    }
    if (pageData.kind === 'asset_history') {
      return renderAssetHistoryPane(pageData);
    }
    if (pageData.kind === 'analytics') {
      return renderAnalyticsPane(pageData);
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
  // --- Inline bulk-edit selection for the trend transaction lists ---
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);

  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;

  const transactionById = useMemo(() => {
    const map = new Map<string, TransactionWithRelations>();
    rawTransactions.forEach((transaction) => map.set(transaction.id, transaction));
    return map;
  }, [rawTransactions]);

  const selectedTransactionTotal = useMemo(() => {
    let total = 0;
    selectedTransactionIds.forEach((id) => {
      const transaction = transactionById.get(id);
      if (!transaction) return;
      total +=
        settings.displayMode === 'time'
          ? getDisplayValueForTransaction(transaction)
          : (transaction.reportingAmount ?? transaction.amount);
    });
    return total;
  }, [
    getDisplayValueForTransaction,
    selectedTransactionIds,
    settings.displayMode,
    transactionById,
  ]);
  const selectedTransactionTotalLabel =
    settings.displayMode === 'time'
      ? formatHours(Math.abs(selectedTransactionTotal))
      : formatAmount(Math.abs(selectedTransactionTotal), settings, { showSign: false });
  const selectionCategoryTypes = useMemo<CategoryType[]>(() => {
    let hasIncome = false;
    let hasExpense = false;
    selectedTransactionIds.forEach((id) => {
      const type = transactionById.get(id)?.type;
      if (type === 'income') hasIncome = true;
      else if (type === 'expense') hasExpense = true;
    });
    const types: CategoryType[] = [];
    if (hasIncome) types.push('income');
    if (hasExpense) types.push('expense');
    return types;
  }, [selectedTransactionIds, transactionById]);

  const toggleTransactionSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((previous) => {
      const index = previous.indexOf(transactionId);
      if (index === -1) return [...previous, transactionId];
      const next = [...previous];
      next.splice(index, 1);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
  }, []);
  const handleTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      onOpenTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, toggleTransactionSelection],
  );
  const handleTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      setSelectedTransactionIds([transaction.id]);
    },
    [isSelectionMode, toggleTransactionSelection],
  );
  const handleOpenBulkUpdate = useCallback(() => {
    if (selectedTransactionCount === 0) return;
    setShowBulkUpdate(true);
  }, [selectedTransactionCount]);
  const handleCloseBulkUpdate = useCallback(() => {
    setShowBulkUpdate(false);
  }, []);
  const handleApplyBulkUpdate = useCallback(
    (changes: BulkTransactionChanges) => {
      if (selectedTransactionIds.length === 0) return;
      const updates = buildBulkUpdateInputs(
        selectedTransactionIds,
        changes,
        (id) => transactionById.get(id)?.type,
      );
      if (updates.length > 0) {
        updateTransactionsBulk(updates);
        void triggerHaptic('success');
      }
      setShowBulkUpdate(false);
      setSelectedTransactionIds([]);
    },
    [selectedTransactionIds, transactionById, updateTransactionsBulk],
  );
  const handleDeleteSelectedTransactions = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    const idsToDelete = [...selectedTransactionIds];
    Alert.alert(
      I18n.t('transactions.selection.delete_title'),
      I18n.t('transactions.selection.delete_message', { count: idsToDelete.length }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteTransactionsBulk(idsToDelete);
            setShowBulkUpdate(false);
            setSelectedTransactionIds([]);
          },
        },
      ],
    );
  }, [deleteTransactionsBulk, selectedTransactionIds]);

  // Leaving the current trend (type or period change) drops any active selection.
  useEffect(() => {
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
  }, [displaySelectedInsightType, activePeriodLabel]);

  const paneRenderVersion = useMemo(
    () =>
      [
        activeBreakdownSliceId ?? '',
        activeLocale,
        settings.currencySymbol,
        settings.displayMode,
        isPro ? 'pro' : 'free',
        isDark ? 'dark' : 'light',
        // Selection state must invalidate the memoized pages so the trend lists
        // re-render with the current selection highlight.
        isSelectionMode ? 'sel' : 'nosel',
        selectedTransactionIds.join(','),
        serializeRecordForSignature(expenseTrendScrubMonthByYear),
        serializeRecordForSignature(incomeTrendScrubMonthByYear),
        serializeRecordForSignature(assetHistoryScrubMonthByYear),
        serializeRecordForSignature(categoryTrendScrubBucketByPeriod),
        serializeRecordForSignature(
          Object.fromEntries(
            Object.entries(trendListVisibleCounts).map(([key, count]) => [key, String(count)]),
          ),
        ),
      ].join('|'),
    [
      activeBreakdownSliceId,
      activeLocale,
      assetHistoryScrubMonthByYear,
      categoryTrendScrubBucketByPeriod,
      expenseTrendScrubMonthByYear,
      isPro,
      incomeTrendScrubMonthByYear,
      isDark,
      isSelectionMode,
      selectedTransactionIds,
      settings.currencySymbol,
      settings.displayMode,
      trendListVisibleCounts,
    ],
  );
  const handleTrendUpgrade = useCallback(() => {
    onOpenProPaywall?.();
  }, [onOpenProPaywall]);

  // Resolves the currently-shown trend transaction list (key + total) for a page, so
  // scrolling near the bottom can grow its visible window (infinite scroll).
  const resolveTrendListContext = useCallback(
    (pageData: InsightPageData): { key: string; total: number } | null => {
      if (pageData.kind === 'expense_trend') {
        const scrubbed = expenseTrendScrubMonthByYearRef.current[pageData.periodKey] ?? null;
        const row =
          pageData.monthRows.find((monthRow) => monthRow.monthKey === scrubbed) ??
          [...pageData.monthRows].reverse().find((monthRow) => monthRow.totalExpense > 0) ??
          pageData.monthRows[pageData.monthRows.length - 1] ??
          null;
        if (!row) return null;
        return {
          key: `expense|${pageData.periodKey}|${row.monthKey}`,
          total: row.transactions.length,
        };
      }
      if (pageData.kind === 'income_trend') {
        const scrubbed = incomeTrendScrubMonthByYearRef.current[pageData.periodKey] ?? null;
        const row =
          pageData.monthRows.find((monthRow) => monthRow.monthKey === scrubbed) ??
          [...pageData.monthRows].reverse().find((monthRow) => monthRow.totalIncome > 0) ??
          pageData.monthRows[pageData.monthRows.length - 1] ??
          null;
        if (!row) return null;
        return {
          key: `income|${pageData.periodKey}|${row.monthKey}`,
          total: row.transactions.length,
        };
      }
      if (pageData.kind === 'category_trend') {
        const scrubbed = categoryTrendScrubBucketByPeriodRef.current[pageData.periodKey] ?? null;
        const row =
          pageData.monthRows.find((monthRow) => monthRow.monthKey === scrubbed) ??
          [...pageData.monthRows].reverse().find((monthRow) => monthRow.totalExpense > 0) ??
          pageData.monthRows[pageData.monthRows.length - 1] ??
          null;
        if (!row) return null;
        return {
          key: `category|${pageData.periodKey}|${row.monthKey}`,
          total: row.transactions.length,
        };
      }
      return null;
    },
    [],
  );
  const handlePaneScrollNearEnd = useCallback(
    (pageData: InsightPageData) => {
      const context = resolveTrendListContext(pageData);
      if (!context) return;
      setTrendListVisibleCounts((previous) => {
        const initial =
          context.key.startsWith('expense|') || context.key.startsWith('income|')
            ? TREND_TRANSACTIONS_INITIAL_EXPENSE_INCOME
            : TREND_TRANSACTIONS_INITIAL;
        const current = previous[context.key] ?? initial;
        if (current >= context.total) return previous;
        return { ...previous, [context.key]: current + TREND_TRANSACTIONS_PAGE };
      });
    },
    [resolveTrendListContext],
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
          onScrollNearEnd={handlePaneScrollNearEnd}
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
      handlePaneScrollNearEnd,
      insightsPageStyle,
      isChartScrubbing,
      paneRenderVersion,
      renderInsightsPaneStable,
      shiftPeriodStateBySteps,
    ],
  );

  const accountOptions = useMemo(() => accounts.slice(0, 6), [accounts]);
  useEffect(() => {
    if (excludedExpenseBreakdownCategoryIds.length === 0) return;
    const validExpenseCategoryIds = new Set(
      categories.filter((category) => category.type === 'expense').map((category) => category.id),
    );
    setExcludedExpenseBreakdownCategoryIds((previous) => {
      const next = previous.filter((categoryId) => validExpenseCategoryIds.has(categoryId));
      return next.length === previous.length ? previous : next;
    });
  }, [categories, excludedExpenseBreakdownCategoryIds.length]);
  useEffect(() => {
    if (excludedIncomeBreakdownCategoryIds.length === 0) return;
    const validIncomeCategoryIds = new Set(
      categories.filter((category) => category.type === 'income').map((category) => category.id),
    );
    setExcludedIncomeBreakdownCategoryIds((previous) => {
      const next = previous.filter((categoryId) => validIncomeCategoryIds.has(categoryId));
      return next.length === previous.length ? previous : next;
    });
  }, [categories, excludedIncomeBreakdownCategoryIds.length]);
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
    if (excludedCategoryTrendAccountIds.length === 0) return;
    const validAccountIds = new Set(accounts.map((account) => account.id));
    setExcludedCategoryTrendAccountIds((previous) => {
      const next = previous.filter((accountId) => validAccountIds.has(accountId));
      return next.length === previous.length ? previous : next;
    });
  }, [accounts, excludedCategoryTrendAccountIds.length]);
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
  const savingsIncomeCategoryPicker = useMemo(
    () => buildInsightsCategoryPickerData(categories, 'income'),
    [categories],
  );
  const savingsExpenseCategoryPicker = useMemo(
    () => buildInsightsCategoryPickerData(categories, 'expense'),
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
  const displayHasCategoryTrendExclusionFilter = displaySelectedInsightType === 'category_trend';
  const displayHasSavingsCategoryExclusionFilter = displaySelectedInsightType === 'savings_rate';
  const displayHasExpenseBreakdownExclusionFilter =
    displaySelectedInsightType === 'expense_breakdown';
  const displayHasIncomeBreakdownExclusionFilter =
    displaySelectedInsightType === 'income_breakdown';
  const displayHasAssetHistoryAccountExclusionFilter =
    displaySelectedInsightType === 'asset_history';
  const displayHasInsightsFilters =
    displayHasPeriodFilter ||
    displayHasAccountFilter ||
    displayHasExpenseTrendExclusionFilter ||
    displayHasIncomeTrendExclusionFilter ||
    displayHasCategoryTrendExclusionFilter ||
    displayHasSavingsCategoryExclusionFilter ||
    displayHasExpenseBreakdownExclusionFilter ||
    displayHasIncomeBreakdownExclusionFilter ||
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
    if (displayHasCategoryTrendExclusionFilter) {
      count += excludedCategoryTrendAccountIds.length;
    }
    if (displayHasAssetHistoryAccountExclusionFilter)
      count += excludedAssetHistoryAccountIds.length;
    if (displayHasSavingsCategoryExclusionFilter) {
      count += excludedSavingsIncomeCategoryIds.length + excludedSavingsExpenseCategoryIds.length;
    }
    if (displayHasExpenseBreakdownExclusionFilter) {
      count += excludedExpenseBreakdownCategoryIds.length;
    }
    if (displayHasIncomeBreakdownExclusionFilter) {
      count += excludedIncomeBreakdownCategoryIds.length;
    }
    return count;
  }, [
    displayHasAccountFilter,
    displayHasAssetHistoryAccountExclusionFilter,
    displayHasExpenseTrendExclusionFilter,
    displayHasIncomeTrendExclusionFilter,
    displayHasCategoryTrendExclusionFilter,
    displayHasInsightsFilters,
    displayHasPeriodFilter,
    displayHasSavingsCategoryExclusionFilter,
    displayHasExpenseBreakdownExclusionFilter,
    displayHasIncomeBreakdownExclusionFilter,
    displayPeriodPreset,
    displaySelectedInsightType,
    excludedAssetHistoryAccountIds.length,
    excludedCategoryTrendAccountIds.length,
    excludedExpenseTrendAccountIds.length,
    excludedExpenseTrendExpenseCategoryIds.length,
    excludedIncomeTrendAccountIds.length,
    excludedIncomeTrendIncomeCategoryIds.length,
    excludedSavingsExpenseCategoryIds.length,
    excludedSavingsIncomeCategoryIds.length,
    excludedExpenseBreakdownCategoryIds.length,
    excludedIncomeBreakdownCategoryIds.length,
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
    setExcludedExpenseBreakdownCategoryIds([]);
    setExcludedIncomeBreakdownCategoryIds([]);
    setExcludedCategoryTrendAccountIds([]);
    setExpenseTrendScrubMonthByYear({});
    setIncomeTrendScrubMonthByYear({});
    setCategoryTrendSelectedCategoryId(null);
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
      setSelectedInsightType(nextInsightType);
    },
    [effectivePeriodPreset, periodPresetByInsight, selectedInsightType, setActiveBreakdownSlice],
  );
  const handleOpenFiltersModal = useCallback(() => {
    setIsPeriodPickerOpen(false);
    setIsFilterModalOpen(true);
  }, []);
  const openInsightMenu = useCallback(() => {
    void triggerHaptic('selection');
    setIsPeriodPickerOpen(false);
    const node = insightsTypeSelectorRef.current;
    if (node) {
      node.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        setInsightMenuAnchorRect(
          measuredWidth > 0 && measuredHeight > 0
            ? { x, y, width: measuredWidth, height: measuredHeight }
            : null,
        );
        setIsInsightMenuOpen(true);
      });
      return;
    }
    setInsightMenuAnchorRect(null);
    setIsInsightMenuOpen(true);
  }, []);
  const handleInsightMenuSelect = useCallback(
    (value: string) => {
      void triggerHaptic('selection');
      setIsInsightMenuOpen(false);
      if (value === 'budget') {
        setIsBudgetViewActive(true);
        return;
      }
      setIsBudgetViewActive(false);
      handleInsightTypeChange(value);
    },
    [handleInsightTypeChange],
  );
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

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      handleInsightTypeSelectorLayout();
    });
    const firstPass = setTimeout(() => {
      handleInsightTypeSelectorLayout();
    }, 40);
    const secondPass = setTimeout(() => {
      handleInsightTypeSelectorLayout();
    }, 220);
    const androidExtraPass =
      Platform.OS === 'android'
        ? setTimeout(() => {
            handleInsightTypeSelectorLayout();
          }, 520)
        : null;

    return () => {
      interactionHandle.cancel();
      clearTimeout(firstPass);
      clearTimeout(secondPass);
      if (androidExtraPass) clearTimeout(androidExtraPass);
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
          <View className="flex-row items-center gap-2">
            <View ref={insightsTypeSelectorRef} onLayout={handleInsightTypeSelectorLayout}>
              <Pressable
                onPress={openInsightMenu}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('insights.insight_type')}
                accessibilityValue={{
                  text: isBudgetViewActive
                    ? String(I18n.t('budget.title'))
                    : String(I18n.t(`insights.${displaySelectedInsightType}`)),
                }}
                accessibilityState={{ expanded: isInsightMenuOpen }}
                className="h-10 w-10 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10 shadow-soft active:scale-90"
              >
                {isBudgetViewActive ? (
                  <Image
                    source={UTILITY_ICON_SOURCES['time-money']}
                    resizeMode="contain"
                    style={styles.insightTypeIconImage}
                  />
                ) : (
                  renderInsightTypeIcon(displaySelectedInsightType)
                )}
                <View className="absolute -bottom-1 -right-1 h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary shadow-sm">
                  <ChevronDown size={11} color="#FFFFFF" strokeWidth={3} />
                </View>
              </Pressable>
            </View>
            <View className="flex-1 items-center px-1">
              <Text
                variant={width < 380 ? 'subheading' : 'headingSm'}
                numberOfLines={1}
                className="text-center tracking-tight"
              >
                {isBudgetViewActive
                  ? String(I18n.t('budget.title'))
                  : String(I18n.t(`insights.${displaySelectedInsightType}`))}
              </Text>
            </View>
            <View className="w-10 items-end justify-center">
              {isBudgetViewActive ? (
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onOpenBudgetTemplates();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('budget.templates_title')}
                  className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
                >
                  <SlidersHorizontal size={18} color={themeColors.primary} />
                </Pressable>
              ) : displayHasInsightsFilters ? (
                <FilterIconButton
                  onPress={handleOpenFiltersModal}
                  count={displayInsightsFilterCount}
                />
              ) : null}
            </View>
          </View>
        }
        monthLabel={isBudgetViewActive ? budgetMonthLabel : activePeriodLabel}
        onPrevMonth={
          isBudgetViewActive ? () => budgetPagerRef.current?.scrollToRelative(-1) : handlePrevMonth
        }
        onNextMonth={
          isBudgetViewActive ? () => budgetPagerRef.current?.scrollToRelative(1) : handleNextMonth
        }
        disableNavArrows={!isBudgetViewActive && displayPeriodPreset === 'lifetime'}
        onMonthPress={
          isBudgetViewActive || displayPeriodPreset === 'lifetime'
            ? undefined
            : handleOpenPeriodPicker
        }
        monthTriggerRef={periodPickerTriggerRef}
        onMonthTriggerLayout={handlePeriodPickerTriggerLayout}
      />

      <View className="flex-1 overflow-hidden bg-background">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <LoadingDots size="large" />
            <Text variant="friendly" tone="muted" className="mt-3">
              {I18n.t('insights.loading')}
            </Text>
          </View>
        ) : isBudgetViewActive ? (
          <BudgetPagerView
            ref={budgetPagerRef}
            onOpenTemplateEditor={onOpenBudgetTemplateEditor}
            onOpenBudgetEditor={onOpenMonthlyBudgetEditor}
            onCreateCustomBudget={onCreateCustomBudget}
            onActiveMonthLabelChange={setBudgetMonthLabel}
          />
        ) : !isPro && proTrendTypeSet.has(displaySelectedInsightType) ? (
          // Locked Pro trend: every pager page would just render the paywall
          // overlay, so skip the horizontal VirtualizedList (4801 slots) entirely
          // and mount a single static overlay. Mounting that windowed list — with
          // its layout pass — during the cold-start preload was a large chunk of
          // the launch commit, especially on the New-Architecture iOS simulator.
          <View className="flex-1">
            <TabletContentContainer>
              <ProTrendPreviewOverlay onUpgrade={handleTrendUpgrade} />
            </TabletContentContainer>
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
              !isChartScrubbing && !isSelectionMode && displayPeriodPreset !== 'lifetime'
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

        {isSelectionMode ? (
          <TransactionSelectionToolbar
            selectedCount={selectedTransactionCount}
            totalNode={
              settings.displayMode === 'time' ? (
                <TimeValueInline
                  value={selectedTransactionTotalLabel}
                  variant="label"
                  iconColor={themeColors.text}
                />
              ) : (
                <Text variant="label" className="text-foreground">
                  {selectedTransactionTotalLabel}
                </Text>
              )
            }
            onCancel={clearSelection}
            onEdit={handleOpenBulkUpdate}
            onDelete={handleDeleteSelectedTransactions}
          />
        ) : null}
      </View>

      {displaySelectedInsightType === 'category_trend' && !isSelectionMode
        ? (() => {
            const stickyOption =
              categoryTrendCategoryOptions.find(
                (category) => category.id === effectiveCategoryTrendCategoryId,
              ) ??
              categoryTrendCategoryOptions[0] ??
              null;
            if (!stickyOption) return null;
            return (
              <View className="bg-background px-5 pt-1.5" style={{ paddingBottom: bottomNavInset }}>
                <TabletContentContainer>
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setIsCategoryTrendPickerOpen(true);
                    }}
                    className="flex-row items-center justify-between rounded-2xl border border-border/50 bg-card px-3.5 py-3 active:opacity-80"
                  >
                    <View className="flex-row items-center gap-2">
                      <CategoryEmoji icon={stickyOption.emoji} size={20} />
                      <Text
                        variant="body"
                        style={{
                          color: themeColors.text,
                          fontFamily: FONT.semibold,
                          fontWeight: '600',
                        }}
                      >
                        {stickyOption.label}
                      </Text>
                    </View>
                    <ChevronDown size={18} color={themeColors.textMuted} />
                  </Pressable>
                </TabletContentContainer>
              </View>
            );
          })()
        : null}

      <BulkEditTransactionsSheet
        visible={showBulkUpdate}
        selectedCount={selectedTransactionCount}
        categoryTypes={selectionCategoryTypes}
        onClose={handleCloseBulkUpdate}
        onApply={handleApplyBulkUpdate}
      />

      <PeriodPickerPopover
        visible={isPeriodPickerOpen}
        anchorRect={periodPickerAnchorRect}
        screenWidth={width}
        screenHeight={height}
        locale={activeLocale}
        weekStartsOn={weekStartsOn}
        currentPreset={effectivePeriodPreset}
        currentAnchorDate={currentPeriodState.anchorDate}
        currentCustomStart={customStart}
        currentCustomEnd={customEnd}
        currentCustomDateField={activeCustomDateField}
        onClose={() => setIsPeriodPickerOpen(false)}
        onCommit={applyPeriodPickerSelection}
      />

      <InsightTypeMenuPopover
        visible={isInsightMenuOpen}
        anchorRect={insightMenuAnchorRect}
        screenWidth={width}
        screenHeight={height}
        options={insightTypeOptions}
        selectedValue={isBudgetViewActive ? 'budget' : displaySelectedInsightType}
        onSelect={handleInsightMenuSelect}
        onClose={() => setIsInsightMenuOpen(false)}
      />

      <ThemeModal
        visible={hasInsightsFilters && isFilterModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (activeInsightsFilterPicker) {
            setActiveInsightsFilterPicker(null);
            return;
          }
          setIsFilterModalOpen(false);
        }}
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
                      label={I18n.t(
                        tab === 'lifetime' ? 'insights.period.all_time' : `insights.period.${tab}`,
                      )}
                      active={periodPreset === tab}
                      onPress={() => {
                        if (tab === 'week' && periodPreset !== 'week') {
                          const currentRange = getPeriodRange(
                            effectivePeriodPreset,
                            currentPeriodState.anchorDate,
                            currentPeriodState.customStart,
                            currentPeriodState.customEnd,
                            weekStartsOn,
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
                          setFilterCustomDateModalVisible(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('insights.filters.start')}
                        className="flex-1 rounded-xl border border-border/30 bg-card px-3 py-2.5"
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
                          setFilterCustomDateModalVisible(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('insights.filters.end')}
                        className="flex-1 rounded-xl border border-border/30 bg-card px-3 py-2.5"
                      >
                        <Text variant="label" tone="muted">
                          {I18n.t('insights.filters.end')}
                        </Text>
                        <Text variant="caption" className="mt-0.5">
                          {customEnd}
                        </Text>
                      </Pressable>
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
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.exclude_accounts')}
                </Text>
                <Pressable
                  onPress={() => setActiveInsightsFilterPicker('assetHistoryAccounts')}
                  className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text
                    variant="body"
                    tone={excludedAssetHistoryAccountIds.length > 0 ? undefined : 'muted'}
                  >
                    {excludedAssetHistoryAccountIds.length > 0
                      ? `${excludedAssetHistoryAccountIds.length} ${I18n.t('insights.filters.excluded')}`
                      : I18n.t('common.none')}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {hasExpenseTrendExclusionFilter ? (
              <View className="gap-3">
                <View className="gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_accounts')}
                  </Text>
                  <Pressable
                    onPress={() => setActiveInsightsFilterPicker('expenseTrendAccounts')}
                    className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                  >
                    <Text
                      variant="body"
                      tone={excludedExpenseTrendAccountIds.length > 0 ? undefined : 'muted'}
                    >
                      {excludedExpenseTrendAccountIds.length > 0
                        ? `${excludedExpenseTrendAccountIds.length} ${I18n.t('insights.filters.excluded')}`
                        : I18n.t('common.none')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>

                <View className="gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_expense_categories')}
                  </Text>
                  <Pressable
                    onPress={() => setActiveInsightsFilterPicker('expenseTrendExpenseCategories')}
                    className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                  >
                    <Text
                      variant="body"
                      tone={excludedExpenseTrendExpenseCategoryIds.length > 0 ? undefined : 'muted'}
                    >
                      {excludedExpenseTrendExpenseCategoryIds.length > 0
                        ? `${excludedExpenseTrendExpenseCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                        : I18n.t('common.none')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {hasIncomeTrendExclusionFilter ? (
              <View className="gap-3">
                <View className="gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_accounts')}
                  </Text>
                  <Pressable
                    onPress={() => setActiveInsightsFilterPicker('incomeTrendAccounts')}
                    className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                  >
                    <Text
                      variant="body"
                      tone={excludedIncomeTrendAccountIds.length > 0 ? undefined : 'muted'}
                    >
                      {excludedIncomeTrendAccountIds.length > 0
                        ? `${excludedIncomeTrendAccountIds.length} ${I18n.t('insights.filters.excluded')}`
                        : I18n.t('common.none')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>

                <View className="gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_income_categories')}
                  </Text>
                  <Pressable
                    onPress={() => setActiveInsightsFilterPicker('incomeTrendIncomeCategories')}
                    className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                  >
                    <Text
                      variant="body"
                      tone={excludedIncomeTrendIncomeCategoryIds.length > 0 ? undefined : 'muted'}
                    >
                      {excludedIncomeTrendIncomeCategoryIds.length > 0
                        ? `${excludedIncomeTrendIncomeCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                        : I18n.t('common.none')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {hasCategoryTrendExclusionFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.exclude_accounts')}
                </Text>
                <Pressable
                  onPress={() => setActiveInsightsFilterPicker('categoryTrendAccounts')}
                  className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text
                    variant="body"
                    tone={excludedCategoryTrendAccountIds.length > 0 ? undefined : 'muted'}
                  >
                    {excludedCategoryTrendAccountIds.length > 0
                      ? `${excludedCategoryTrendAccountIds.length} ${I18n.t('insights.filters.excluded')}`
                      : I18n.t('common.none')}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {hasExpenseBreakdownExclusionFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.exclude_expense_categories')}
                </Text>
                <Pressable
                  onPress={() => setActiveInsightsFilterPicker('expenseBreakdownCategories')}
                  className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text
                    variant="body"
                    tone={excludedExpenseBreakdownCategoryIds.length > 0 ? undefined : 'muted'}
                  >
                    {excludedExpenseBreakdownCategoryIds.length > 0
                      ? `${excludedExpenseBreakdownCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                      : I18n.t('common.none')}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {hasIncomeBreakdownExclusionFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.exclude_income_categories')}
                </Text>
                <Pressable
                  onPress={() => setActiveInsightsFilterPicker('incomeBreakdownCategories')}
                  className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text
                    variant="body"
                    tone={excludedIncomeBreakdownCategoryIds.length > 0 ? undefined : 'muted'}
                  >
                    {excludedIncomeBreakdownCategoryIds.length > 0
                      ? `${excludedIncomeBreakdownCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                      : I18n.t('common.none')}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {hasSavingsCategoryExclusionFilter ? (
              <View className="gap-3">
                <View className="gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_income_categories')}
                  </Text>
                  <Pressable
                    onPress={() => setActiveInsightsFilterPicker('savingsIncomeCategories')}
                    className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                  >
                    <Text
                      variant="body"
                      tone={excludedSavingsIncomeCategoryIds.length > 0 ? undefined : 'muted'}
                    >
                      {excludedSavingsIncomeCategoryIds.length > 0
                        ? `${excludedSavingsIncomeCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                        : I18n.t('common.none')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>

                <View className="gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('insights.filters.exclude_expense_categories')}
                  </Text>
                  <Pressable
                    onPress={() => setActiveInsightsFilterPicker('savingsExpenseCategories')}
                    className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
                  >
                    <Text
                      variant="body"
                      tone={excludedSavingsExpenseCategoryIds.length > 0 ? undefined : 'muted'}
                    >
                      {excludedSavingsExpenseCategoryIds.length > 0
                        ? `${excludedSavingsExpenseCategoryIds.length} ${I18n.t('insights.filters.excluded')}`
                        : I18n.t('common.none')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>
          <AccountPickerSheet
            overlay
            visible={activeInsightsFilterPicker === 'assetHistoryAccounts'}
            onClose={closeInsightsFilterPicker}
            accounts={assetHistoryAccountOptions}
            accountGroups={accountGroups}
            selectedIds={excludedAssetHistoryAccountIds}
            onToggleSelect={(accountId) =>
              setExcludedAssetHistoryAccountIds((previous) => toggleStringId(previous, accountId))
            }
            onClear={() => setExcludedAssetHistoryAccountIds([])}
          />
          <AccountPickerSheet
            overlay
            visible={activeInsightsFilterPicker === 'expenseTrendAccounts'}
            onClose={closeInsightsFilterPicker}
            accounts={accounts}
            accountGroups={accountGroups}
            selectedIds={excludedExpenseTrendAccountIds}
            onToggleSelect={(accountId) =>
              setExcludedExpenseTrendAccountIds((previous) => toggleStringId(previous, accountId))
            }
            onClear={() => setExcludedExpenseTrendAccountIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeInsightsFilterPicker === 'expenseTrendExpenseCategories'}
            onClose={closeInsightsFilterPicker}
            parents={savingsExpenseCategoryPicker.parents}
            childByParent={savingsExpenseCategoryPicker.childByParent}
            selectedCategoryIds={excludedExpenseTrendExpenseCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedExpenseTrendExpenseCategoryIds((previous) =>
                toggleStringId(previous, categoryId),
              )
            }
            onClear={() => setExcludedExpenseTrendExpenseCategoryIds([])}
          />
          <AccountPickerSheet
            overlay
            visible={activeInsightsFilterPicker === 'incomeTrendAccounts'}
            onClose={closeInsightsFilterPicker}
            accounts={accounts}
            accountGroups={accountGroups}
            selectedIds={excludedIncomeTrendAccountIds}
            onToggleSelect={(accountId) =>
              setExcludedIncomeTrendAccountIds((previous) => toggleStringId(previous, accountId))
            }
            onClear={() => setExcludedIncomeTrendAccountIds([])}
          />
          <AccountPickerSheet
            overlay
            visible={activeInsightsFilterPicker === 'categoryTrendAccounts'}
            onClose={closeInsightsFilterPicker}
            accounts={accounts}
            accountGroups={accountGroups}
            selectedIds={excludedCategoryTrendAccountIds}
            onToggleSelect={(accountId) =>
              setExcludedCategoryTrendAccountIds((previous) => toggleStringId(previous, accountId))
            }
            onClear={() => setExcludedCategoryTrendAccountIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeInsightsFilterPicker === 'incomeTrendIncomeCategories'}
            onClose={closeInsightsFilterPicker}
            parents={savingsIncomeCategoryPicker.parents}
            childByParent={savingsIncomeCategoryPicker.childByParent}
            selectedCategoryIds={excludedIncomeTrendIncomeCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedIncomeTrendIncomeCategoryIds((previous) =>
                toggleStringId(previous, categoryId),
              )
            }
            onClear={() => setExcludedIncomeTrendIncomeCategoryIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeInsightsFilterPicker === 'expenseBreakdownCategories'}
            onClose={closeInsightsFilterPicker}
            parents={savingsExpenseCategoryPicker.parents}
            childByParent={savingsExpenseCategoryPicker.childByParent}
            selectedCategoryIds={excludedExpenseBreakdownCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedExpenseBreakdownCategoryIds((prev) => toggleStringId(prev, categoryId))
            }
            onClear={() => setExcludedExpenseBreakdownCategoryIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeInsightsFilterPicker === 'incomeBreakdownCategories'}
            onClose={closeInsightsFilterPicker}
            parents={savingsIncomeCategoryPicker.parents}
            childByParent={savingsIncomeCategoryPicker.childByParent}
            selectedCategoryIds={excludedIncomeBreakdownCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedIncomeBreakdownCategoryIds((prev) => toggleStringId(prev, categoryId))
            }
            onClear={() => setExcludedIncomeBreakdownCategoryIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeInsightsFilterPicker === 'savingsIncomeCategories'}
            onClose={closeInsightsFilterPicker}
            parents={savingsIncomeCategoryPicker.parents}
            childByParent={savingsIncomeCategoryPicker.childByParent}
            selectedCategoryIds={excludedSavingsIncomeCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedSavingsIncomeCategoryIds((prev) => toggleStringId(prev, categoryId))
            }
            onClear={() => setExcludedSavingsIncomeCategoryIds([])}
          />
          <CategoryPickerSheet
            overlay
            allowParentSelection
            visible={activeInsightsFilterPicker === 'savingsExpenseCategories'}
            onClose={closeInsightsFilterPicker}
            parents={savingsExpenseCategoryPicker.parents}
            childByParent={savingsExpenseCategoryPicker.childByParent}
            selectedCategoryIds={excludedSavingsExpenseCategoryIds}
            onToggleSelect={(categoryId) =>
              setExcludedSavingsExpenseCategoryIds((prev) => toggleStringId(prev, categoryId))
            }
            onClear={() => setExcludedSavingsExpenseCategoryIds([])}
          />
          <DatePickerModal
            visible={filterCustomDateModalVisible}
            value={activeCustomDateField === 'start' ? customStart : customEnd}
            showQuickDays={false}
            overlay
            onSelect={(value) => {
              handleCustomDateSelect(activeCustomDateField, value);
              setFilterCustomDateModalVisible(false);
            }}
            onClose={() => setFilterCustomDateModalVisible(false)}
          />
        </SafeAreaView>
      </ThemeModal>

      <CategoryPickerSheet
        allowParentSelection
        visible={isCategoryTrendPickerOpen}
        onClose={() => setIsCategoryTrendPickerOpen(false)}
        parents={savingsExpenseCategoryPicker.parents}
        childByParent={EMPTY_CATEGORY_CHILD_MAP}
        selectedCategoryId={effectiveCategoryTrendCategoryId}
        onSelect={(categoryId) => {
          void triggerHaptic('selection');
          setCategoryTrendSelectedCategoryId(categoryId);
          setIsCategoryTrendPickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
