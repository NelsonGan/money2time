import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Landmark,
  PiggyBank,
  Smile,
  Star,
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
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
  type ViewInstance,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  ClipPath,
  G,
  Image as SvgImage,
  Polyline,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import { DatePickerModal } from '~/components/datePicker';
import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { ContentFrameProvider, useContentFrame } from '~/components/layout/ContentFrame';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import {
  useBottomNavContentInset,
  useBottomNavScrollReporter,
} from '~/components/navigation/BottomNavMinimize';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  AccountPickerSheet,
  CategoryEmoji,
  CategoryPickerSheet,
  ClayIcon,
  SelectionFilterField,
  Text,
  ThemeModal,
  TimeValueInline,
} from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import type { GeneratedCategoryIconSource } from '~/constants/categoryIcons';
import {
  CATEGORY_ICON_CELL_SIZE,
  categoryIconToEmoji,
  classifyCategoryIcon,
} from '~/constants/categoryIcons';
import { chartCategoryColor } from '~/constants/chartColors';
import { type ColorPalette, LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { LONG_RANGE_PAGER_CENTER_INDEX, LONG_RANGE_PAGER_TOTAL_SLOTS } from '~/constants/pager';
import { PRO_TREND_TYPES, type ProTrendType } from '~/constants/proLimits';
import { UTILITY_ICON_SOURCES } from '~/constants/utilityIcons';
import { useApp, useTransactions } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { BudgetPagerView, type BudgetPagerViewHandle } from '~/features/budget/screens';
import { dayKeyToUtcDate } from '~/features/calendar/lib/calendarBuild';
import {
  type AssetHistoryAccountOverrides,
  assetHistoryExcludedAccountIds,
  type AssetHistoryLedger,
  assetHistoryTotalForMonth,
  buildAssetHistoryLedger,
  includeAllAssetHistoryAccounts,
  isAssetHistoryAccountExcluded,
  parseAssetHistoryAccountOverrides,
  pruneAssetHistoryOverrides,
  showOnlyAssetHistoryAccount,
  toggleAssetHistoryAccount,
} from '~/features/insights/assetHistory';
import { buildInsightsCategoryPickerData } from '~/features/insights/categoryPickerData';
import { CategoryTrendChips } from '~/features/insights/components/CategoryTrendChips';
import {
  InsightPaneSlotProvider,
  InsightPaneSplit,
  isSplitInsightPane,
} from '~/features/insights/components/InsightPaneSplit';
import { InsightPeriodSwitcher } from '~/features/insights/components/InsightPeriodSwitcher';
import { InsightSubTabs } from '~/features/insights/components/InsightSubTabs';
import { ProTrendPreviewOverlay } from '~/features/insights/components/ProTrendPreviewOverlay';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import {
  TrendLineChart,
  type TrendLineChartBucket,
  type TrendLineChartSeries,
} from '~/features/insights/components/TrendLineChart';
import {
  TrendCompareSummary,
  TrendHeadline,
  type TrendHeadlineBadge,
} from '~/features/insights/components/TrendSummary';
import {
  INSIGHT_GROUP_MEMBERS,
  INSIGHT_MENU_ENTRIES,
  type InsightGroupId,
  insightGroupOf,
  insightMenuEntryOf,
  insightTypeForGroup,
  isInsightGroupId,
  type LastInsightTypeByGroup,
  parseLastInsightTypeByGroup,
} from '~/features/insights/insightGroups';
import {
  buildSavingsIncludePredicate,
  categoryFilterIds,
  filterModeOf,
  type InsightsFilterKey,
  type InsightsFilterModes,
  parseInsightsFilterModes,
} from '~/features/insights/insightsFilterModes';
import { getPeriodPagerCommitSteps } from '~/features/insights/lib/periodPager';
import {
  compareCategoryTotals,
  percentChange,
  summarizeTrend,
} from '~/features/insights/lib/trendStats';
import { countsTowardSpending } from '~/features/reimbursements/lib/reimbursementMath';
import {
  EMPTY_REVIEW_FILTERS,
  pruneReviewFilters,
  reviewFilterCount,
  type ReviewFilters,
} from '~/features/review/lib/reviewFilters';
import type { ReviewZoom } from '~/features/review/lib/reviewPeriods';
import { ReviewPagerView, type ReviewPagerViewHandle } from '~/features/review/screens';
import {
  ActivityTransactionList,
  buildBulkUpdateInputs,
  BulkEditTransactionsSheet,
  type BulkTransactionChanges,
  DuplicateTransactionsDatePicker,
  TransactionSelectionToolbar,
} from '~/features/transactions/components';
import { canDuplicateTransaction } from '~/features/transactions/lib/duplicateTransaction';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePagerWidthResnap } from '~/hooks/usePagerWidthResnap';
import { usePersistedJsonSnapshot } from '~/hooks/usePersistedJsonSnapshot';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  consumePendingFocusInsight,
  subscribeFocusInsightRequest,
} from '~/services/insightsNavigation';
import { getCustomLogoUri } from '~/services/userAssets';
import type {
  BudgetPeriod,
  Category,
  CategoryType,
  MonthCycleInput,
  TransactionWithRelations,
  UserSettings,
  WeekStartsOn,
} from '~/types';
import { cn } from '~/utils';
import { readableColumn } from '~/utils/adaptiveLayout';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { withColorAlpha } from '~/utils/color';
import { convert } from '~/utils/currency';
import {
  addFinancialMonths,
  financialMonthAnchorForToday,
  financialMonthKeyForDate,
  financialMonthKeyForIso,
  financialMonthRange,
  financialMonthStartDate,
  monthCycleOf,
} from '~/utils/financialMonth';
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
  formatHoursCompact,
  monthKeyFromDateLocal,
  parseMonthKey,
  startOfMonthDate,
  toRange,
} from '~/utils/formatters';
import {
  DEFAULT_SELECTION_FILTER_MODE,
  isSelectionFilterMode,
  passesSelectionFilter,
  type SelectionFilterMode,
} from '~/utils/selectionFilter';
import { asSpendingRow, countsAsExpenseRow } from '~/utils/spending';

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
  // Review is a full-page takeover like `budget`: it owns its own period rail
  // and only ever shows completed weeks/months/years.
  'review',
  'expense_breakdown',
  'income_breakdown',
  'savings_rate',
  // Budget is a full-page takeover (its own month pager) rather than a period-
  // paged chart, but it is a first-class insight type: selectable from the
  // menu and persisted via `selectedInsightType` like every other page.
  'budget',
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
  // Review renders the `calendar-clock` image icon (see INSIGHT_TYPE_ICON_NAME),
  // so this Lucide fallback is never drawn; it exists only to satisfy the map.
  review: {
    Icon: PiggyBank,
    tint: '#B1525F',
    background: '#FCE7EA',
    border: '#F0C3CB',
  },
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
  // Budget renders the `time-money` image icon (see INSIGHT_TYPE_ICON_NAME), so
  // this Lucide fallback is never drawn; it exists only to satisfy the map.
  budget: {
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
  review: 'calendar-clock',
  expense_breakdown: 'wallet-cash',
  income_breakdown: 'wallet-cash-blue',
  savings_rate: 'piggy-bank-coins',
  budget: 'time-money',
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

const INSIGHTS_PAGER_TOTAL_SLOTS = LONG_RANGE_PAGER_TOTAL_SLOTS;
const INSIGHTS_PAGER_CENTER_INDEX = LONG_RANGE_PAGER_CENTER_INDEX;
const INSIGHTS_LIST_STYLE = { flex: 1 } as const;
const INSIGHTS_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: spacing.screenHorizontal,
  paddingBottom: LIST_BOTTOM_PADDING,
  paddingTop: spacing.xxs,
} as const;
const TREND_CHART_HEIGHT = 236;
const TREND_COMPARE_CHART_HEIGHT = 262;
/** The charted category and the one it is compared with. */
const CATEGORY_TREND_PRIMARY_COLOR = '#2F7BC4';
const CATEGORY_TREND_COMPARE_COLOR = '#E8833A';
const TREND_INSIGHT_TYPE_BY_KIND = {
  expense: 'expense_trend',
  income: 'income_trend',
  category: 'category_trend',
  asset: 'asset_history',
} as const;
const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];
const SENTIMENT_CHART_HEIGHT = 280;
const SENTIMENT_COLORS = { happy: '#4CAF50', neutral: '#FFB74D', sad: '#E57373' } as const;
const INSIGHTS_LINE_CHART_SIDE_INSET = 8;
const INSIGHTS_LINE_CHART_SECTION_BLEED = 10;
const MONTHS_PER_YEAR = 12;
const HEALTHY_SAVINGS_RATE_THRESHOLD = 0.2;
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
const INSIGHTS_FILTER_MODAL_CONTENT_STYLE = {
  padding: spacing.screenHorizontal,
  paddingBottom: LIST_BOTTOM_PADDING + spacing.xs,
  gap: spacing.sm,
} as const;
const EMPTY_ASSET_HISTORY_LEDGER: AssetHistoryLedger = { accounts: [] };
const YEAR_MONTH_LABELS_CACHE = new Map<string, string[]>();
const MONTH_LABEL_BY_KEY_CACHE = new Map<string, string>();
const PERIOD_MONTH_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_YEAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const PERIOD_MONTH_DAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const MONTH_SHORT_YEAR_LABEL_CACHE = new Map<string, string>();
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

/** Header height assumed for the first frame of a split page, before it is measured. */
const SPLIT_HEADER_HEIGHT_ESTIMATE = 112;

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  splitHeader: { position: 'absolute', top: 0, left: 0, zIndex: 2 },
  stackedHeader: { zIndex: 2 },
  chartSizeCenter: {
    alignSelf: 'center',
  },
  breakdownPercentBadge: {
    borderRadius: 999,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  savingsMonthTile: {
    width: 44,
    height: 36,
  },
  // Wide enough for "-100.0%", so every row's ring lines up.
  savingsRatePill: {
    minWidth: 64,
  },
  savingsBestBadge: {
    top: -5,
    right: -5,
    width: 16,
    height: 16,
  },
  secondaryDetail: {
    fontSize: 11,
    lineHeight: 14,
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
  // Like budget: the review page owns its own period rail, so a non-null
  // fixedPeriodPreset hides the header's period picker. The value is unused.
  review: {
    fixedPeriodPreset: 'week',
    allowAccountFilter: false,
  },
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
  // Budget has no period/account filters — its own month pager drives the
  // header's month controls. A non-null fixedPeriodPreset hides the period
  // picker; the value itself is unused since the budget pager owns navigation.
  budget: {
    fixedPeriodPreset: 'month',
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

type AssetHistoryMonthRow = {
  monthKey: string;
  label: string;
  totalAssets: number;
};

type ExpenseTrendMonthRow = {
  monthKey: string;
  axisLabel: string;
  label: string;
  totalExpense: number;
  transactionCount: number;
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
  /** The second category's buckets, aligned with `monthRows`, when comparing. */
  compareCategoryId: string | null;
  compareMonthRows: ExpenseTrendMonthRow[] | null;
};

type IncomeTrendMonthRow = {
  monthKey: string;
  axisLabel: string;
  label: string;
  totalIncome: number;
  transactionCount: number;
  transactions: TransactionWithRelations[];
};

type IncomeTrendPageData = InsightBasePageData & {
  kind: 'income_trend';
  year: number;
  periodKey: string;
  granularity: TrendGranularity;
  monthRows: IncomeTrendMonthRow[];
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

type TrendKind = 'expense' | 'income' | 'category' | 'asset';
/** What a trend page's chart draws, built once per (cached) page. */
type TrendChartModel = {
  buckets: TrendLineChartBucket[];
  series: TrendLineChartSeries[];
  /** Primary values, null for buckets that have not happened yet. */
  values: (number | null)[];
  compareValues: (number | null)[] | null;
  /** Each bucket's transactions (both categories' when comparing), newest first. */
  transactionsByKey: Map<string, TransactionWithRelations[]>;
};

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
  },
  income_trend: {
    kind: 'income_trend',
    range: LOCKED_TREND_EMPTY_RANGE,
    filteredForRange: [],
    year: 0,
    periodKey: '',
    granularity: 'month',
    monthRows: [],
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
    compareCategoryId: null,
    compareMonthRows: null,
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

function buildMonthPeriodState(
  targetMonthDate: Date,
  monthCycle: MonthCycleInput = 1,
): PeriodState {
  const monthKey = financialMonthKeyForDate(targetMonthDate, monthCycle);
  const { start, endInclusive } = financialMonthRange(monthKey, monthCycle);
  return {
    anchorDate: start,
    customStart: formatDateInput(start),
    customEnd: formatDateInput(endInclusive),
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
  assetHistoryAccountOverrides: AssetHistoryAccountOverrides;
  excludedCategoryTrendAccountIds: string[];
  excludedReviewAccountIds: string[];
  excludedReviewExpenseCategoryIds: string[];
  excludedReviewIncomeCategoryIds: string[];
  reviewAccountMode: SelectionFilterMode;
  reviewExpenseCategoryMode: SelectionFilterMode;
  reviewIncomeCategoryMode: SelectionFilterMode;
  insightsFilterModes: InsightsFilterModes;
  categoryTrendSelectedCategoryId: string | null;
  categoryTrendCompareCategoryId: string | null;
  lastInsightTypeByGroup: LastInsightTypeByGroup;
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
    const assetHistoryAccountOverrides = parseAssetHistoryAccountOverrides(parsed);
    if (assetHistoryAccountOverrides) {
      next.assetHistoryAccountOverrides = assetHistoryAccountOverrides;
    }
    next.excludedCategoryTrendAccountIds = toUniqueStringList(
      parsed.excludedCategoryTrendAccountIds,
    );
    next.excludedReviewAccountIds = toUniqueStringList(parsed.excludedReviewAccountIds);
    next.excludedReviewExpenseCategoryIds = toUniqueStringList(
      parsed.excludedReviewExpenseCategoryIds,
    );
    next.excludedReviewIncomeCategoryIds = toUniqueStringList(
      parsed.excludedReviewIncomeCategoryIds,
    );
    if (isSelectionFilterMode(parsed.reviewAccountMode)) {
      next.reviewAccountMode = parsed.reviewAccountMode;
    }
    if (isSelectionFilterMode(parsed.reviewExpenseCategoryMode)) {
      next.reviewExpenseCategoryMode = parsed.reviewExpenseCategoryMode;
    }
    if (isSelectionFilterMode(parsed.reviewIncomeCategoryMode)) {
      next.reviewIncomeCategoryMode = parsed.reviewIncomeCategoryMode;
    }
    const insightsFilterModes = parseInsightsFilterModes(parsed.insightsFilterModes);
    if (insightsFilterModes) next.insightsFilterModes = insightsFilterModes;
    if (typeof parsed.categoryTrendSelectedCategoryId === 'string') {
      const trimmed = parsed.categoryTrendSelectedCategoryId.trim();
      next.categoryTrendSelectedCategoryId = trimmed.length > 0 ? trimmed : null;
    } else if (parsed.categoryTrendSelectedCategoryId === null) {
      next.categoryTrendSelectedCategoryId = null;
    }
    if (typeof parsed.categoryTrendCompareCategoryId === 'string') {
      const trimmed = parsed.categoryTrendCompareCategoryId.trim();
      next.categoryTrendCompareCategoryId = trimmed.length > 0 ? trimmed : null;
    }
    const lastInsightTypeByGroup = parseLastInsightTypeByGroup(parsed.lastInsightTypeByGroup);
    if (lastInsightTypeByGroup) next.lastInsightTypeByGroup = lastInsightTypeByGroup;

    return next;
  } catch {
    return null;
  }
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

function resolveActivityInsightPeriodState(
  request: {
    monthKey: string;
    anchorDateKey?: string;
    customStart?: string;
    customEnd?: string;
    periodPreset?: PeriodPreset;
  },
  monthCycle: MonthCycleInput = 1,
): PeriodState {
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

  // The request's monthKey is a financial month key, so anchor on that period's
  // real start day (not the 1st), then let buildMonthPeriodState frame it.
  const monthDate = parseMonthKey(request.monthKey)
    ? financialMonthStartDate(request.monthKey, monthCycle)
    : financialMonthAnchorForToday(monthCycle);
  return buildMonthPeriodState(monthDate, monthCycle);
}

function addPeriodBySteps(
  date: Date,
  preset: Exclude<PeriodPreset, 'custom'>,
  steps: number,
  monthCycle: MonthCycleInput = 1,
) {
  if (preset === 'month') return addFinancialMonths(date, steps, monthCycle);
  const next = new Date(date);
  if (preset === 'week') next.setDate(next.getDate() + 7 * steps);
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
  monthCycle: MonthCycleInput = 1,
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
    const monthKey = financialMonthKeyForDate(anchorDate, monthCycle);
    const { start, endInclusive } = financialMonthRange(monthKey, monthCycle);
    return toRange(start, endInclusive);
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

/** "Aug 2026" for a "2026-08" bucket, in the user's locale. */
function monthShortYearLabel(monthKey: string, locale: string): string {
  const cacheKey = `${locale}|${monthKey}`;
  const cached = MONTH_SHORT_YEAR_LABEL_CACHE.get(cacheKey);
  if (cached) return cached;
  const monthStart = monthStartUtcDateFromMonthKey(monthKey);
  if (!monthStart) return monthKey;
  const label = monthStart.toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  MONTH_SHORT_YEAR_LABEL_CACHE.set(cacheKey, label);
  return label;
}

function sortTransactionsNewestFirst(
  transactions: TransactionWithRelations[],
): TransactionWithRelations[] {
  return transactions.sort((a, b) => {
    const dateDelta = b.date.localeCompare(a.date);
    if (dateDelta !== 0) return dateDelta;
    return b.createdAt.localeCompare(a.createdAt);
  });
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

// Tone, icon, and status copy all derive from the same rounded percent the user
// sees, so the label and colors can never disagree (e.g. a -0.04% year rounds to
// '0.0%' and reads as the amber "getting there" state, not a red overspend).
/** Green once the rate is healthy, amber while it is building, red when overspent. */
function savingsRateColor(displayRatePercent: number | null, palette: ColorPalette): string {
  if (displayRatePercent === null) return palette.textMuted;
  if (displayRatePercent >= HEALTHY_SAVINGS_RATE_THRESHOLD * 100) return palette.success;
  if (displayRatePercent >= 0) return palette.accent;
  return palette.error;
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

const TREND_TRANSACTIONS_INITIAL = 5;
const TREND_TRANSACTIONS_INITIAL_EXPENSE_INCOME = 7;
const TREND_TRANSACTIONS_PAGE = 10;

// Renders a selected month's transaction list capped at `visibleCount` rows. The cap
// is owned by the screen (keyed per list) and grown as the page scrolls near its end,
// so the non-virtualized list stays cheap to render while the chart is scrubbed.
const TrendMonthTransactions = React.memo(function TrendMonthTransactionsImpl({
  transactions,
  visibleCount,
  locale,
  displaySettings,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  reimbursementsCountAsExpense,
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
  displaySettings: Pick<
    UserSettings,
    'currencySymbol' | 'displayMode' | 'workdayDisplayEnabled' | 'workingHoursPerDay'
  >;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  reimbursementsCountAsExpense: boolean;
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
    () => sortTransactionsNewestFirst([...transactions]),
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
      reimbursementsCountAsExpense={reimbursementsCountAsExpense}
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
  monthCycle,
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
  monthCycle: MonthCycleInput;
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
        monthCycle,
      ),
    [currentPreset, draftAnchorDate, draftCustomEnd, draftCustomStart, weekStartsOn, monthCycle],
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
                              anchorDate: financialMonthStartDate(
                                `${visibleMonthYear}-${String(monthIndex + 1).padStart(2, '0')}`,
                                monthCycle,
                              ),
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

/**
 * Pie-slice labels are SVG, so they draw an image or a text glyph, never a
 * bundled-PNG-plus-fallback pair. Resolves both bundled icons and user uploads
 * to an <SvgImage href>; anything else returns null and the caller falls back
 * to categoryIconToEmoji text.
 */
type PieLabelIconSource =
  | { kind: 'sprite'; sprite: GeneratedCategoryIconSource }
  | { kind: 'image'; source: ImageSourcePropType };

function pieLabelIconSource(value?: string | null): PieLabelIconSource | null {
  const classified = classifyCategoryIcon(value);
  if (classified.kind === 'bundled') return { kind: 'sprite', sprite: classified.source };
  if (classified.kind === 'custom') {
    const uri = getCustomLogoUri(classified.ref);
    return uri ? { kind: 'image', source: { uri } } : null;
  }
  return null;
}

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
  const insets = useSafeAreaInsets();
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
  // dropping down beneath the icon. Floor at the top safe-area inset so the
  // full-screen modal never tucks the first row under the Android status bar.
  const topLimit = insets.top + sideMargin;
  const cardTop = clampNumber(
    anchorRect?.y ?? spacing.xl * 2,
    topLimit,
    Math.max(topLimit, screenHeight - 220 - sideMargin),
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
  function InsightsWindowPageImpl({
    item,
    pageData,
    pageStyle,
    paneRenderVersion: _paneRenderVersion,
    getPageScrollRef,
    renderInsightsPane,
    onScrollNearEnd,
    split,
  }: {
    item: number;
    pageData: InsightPageData;
    pageStyle: { width: number };
    /** Open iPhone Duo: pane widths and the header's height; else null. */
    split: InsightsSplit | null;
    paneRenderVersion: string;
    getPageScrollRef: (index: number) => { current: ScrollViewInstance | null };
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
    const pane = renderInsightsPane(pageData);
    // The scroll view the page's list lives in: the only one when stacked,
    // the right pane when split. It reports scrolling and scrolls to top.
    const listScrollProps = {
      ref: (ref: ScrollViewInstance | null) => {
        getPageScrollRef(item).current = ref;
      },
      className: 'flex-1',
      contentContainerStyle: contentStyle,
      onScroll: handleScroll,
      scrollEventThrottle: 32,
    };
    // A horizontal list cell sizes itself from this width. flex-1 gives the
    // page a zero flex basis, which can collapse a newly mounted Android
    // cell and shift every following month away from getItemLayout.
    if (!split) {
      return (
        <View style={pageStyle} className="h-full shrink-0 bg-background">
          <ScrollView {...listScrollProps}>
            <TabletContentContainer>{pane}</TabletContentContainer>
          </ScrollView>
        </View>
      );
    }
    if (!isSplitInsightPane(pane)) {
      // Empty states: under the header, in the left pane.
      return (
        <View style={pageStyle} className="h-full shrink-0 bg-background">
          <View style={[styles.flexOne, { width: split.left, paddingTop: split.top }]}>
            <ContentFrameProvider width={split.left} height={split.height}>
              <ScrollView {...listScrollProps}>{pane}</ScrollView>
            </ContentFrameProvider>
          </View>
        </View>
      );
    }
    // Chart in the left pane under the header, details from the top of the
    // right pane: one half each, nothing across the fold.
    return (
      <View style={pageStyle} className="h-full shrink-0 flex-row bg-background">
        <View style={{ width: split.left, paddingTop: split.top }}>
          <ContentFrameProvider width={split.left} height={split.height}>
            <ScrollView className="flex-1" contentContainerStyle={contentStyle}>
              <InsightPaneSlotProvider value="primary">{pane}</InsightPaneSlotProvider>
            </ScrollView>
          </ContentFrameProvider>
        </View>
        <View style={{ width: split.right, paddingTop: spacing.md }}>
          <ContentFrameProvider width={split.right} height={split.height}>
            <ScrollView {...listScrollProps}>
              <InsightPaneSlotProvider value="secondary">{pane}</InsightPaneSlotProvider>
            </ScrollView>
          </ContentFrameProvider>
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.pageData === next.pageData &&
    prev.pageStyle === next.pageStyle &&
    prev.paneRenderVersion === next.paneRenderVersion &&
    prev.getPageScrollRef === next.getPageScrollRef &&
    prev.renderInsightsPane === next.renderInsightsPane &&
    prev.onScrollNearEnd === next.onScrollNearEnd &&
    prev.split === next.split,
);

/** The open iPhone Duo's split: pane widths, the header's height, the page height. */
interface InsightsSplit {
  left: number;
  right: number;
  top: number;
  height: number;
}

interface InsightsScreenProps {
  resetToCurrentMonthToken?: number;
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenProPaywall?: () => void;
  /** Budget view (embedded as an insights page via the type menu). */
  onOpenBudgetTemplates: () => void;
  onOpenBudgetTemplateEditor: (params?: {
    templateId?: string;
    duplicateFromId?: string;
    period?: BudgetPeriod;
  }) => void;
  onOpenPeriodBudgetEditor: (budgetId: string) => void;
  onCreateCustomBudget: (period: BudgetPeriod, periodKey: string) => void;
  activityBreakdownInsightRequest?: {
    insightType: NavigableInsightType;
    anchorDateKey?: string;
    customEnd?: string;
    customStart?: string;
    monthKey: string;
    periodPreset?: PeriodPreset;
    token: number;
  } | null;
}

export function InsightsScreen({
  resetToCurrentMonthToken = 0,
  onOpenDrilldown,
  onOpenTransaction,
  onOpenProPaywall,
  onOpenBudgetTemplates,
  onOpenBudgetTemplateEditor,
  onOpenPeriodBudgetEditor,
  onCreateCustomBudget,
  activityBreakdownInsightRequest = null,
}: InsightsScreenProps) {
  const {
    isLoading,
    settings,
    categories,
    accounts,
    accountGroups,
    getTrueHourlyRateForDate,
    getDisplayValueForTransaction,
    insightsPreferencesJson,
    updateInsightsPreferencesJson,
    updateTransactionsBulk,
    deleteTransactionsBulk,
    rateTable,
  } = useApp();
  const { transactions: rawTransactions } = useTransactions();
  const isPro = useIsPro();
  const proTrendTypeSet = useMemo(() => new Set<string>(PRO_TREND_TYPES), []);

  const allTransactions = rawTransactions;
  const monthCycle = monthCycleOf(settings);
  const { transactionDayKeyById, transactionMonthKeyById } = useMemo(() => {
    const dayKeyById = new Map<string, string>();
    const monthKeyById = new Map<string, string>();

    allTransactions.forEach((transaction) => {
      dayKeyById.set(transaction.id, dayKeyFromIsoLocal(transaction.date));
      monthKeyById.set(transaction.id, financialMonthKeyForIso(transaction.date, monthCycle));
    });

    return {
      transactionDayKeyById: dayKeyById,
      transactionMonthKeyById: monthKeyById,
    };
  }, [allTransactions, monthCycle]);
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const weekStartsOn = settings.weekStartsOn;
  // Imperative handlers (reset effects, restore/reset callbacks) read the current
  // value via this ref so they never capture a stale first-day in an empty/narrow
  // dep array, and changing the setting doesn't re-trigger them. Render-path memos
  // keep using the reactive `monthCycle` so they recompute on change.
  const monthCycleRef = useRef(monthCycle);
  monthCycleRef.current = monthCycle;

  const [periodPresetByInsight, setPeriodPresetByInsight] = useState<
    Partial<Record<InsightType, PeriodPreset>>
  >({});
  const [activityRequestPeriodPreset, setActivityRequestPeriodPreset] = useState<{
    insightType: InsightType;
    preset: PeriodPreset;
  } | null>(null);
  const [anchorDate, setAnchorDate] = useState(() => financialMonthAnchorForToday(monthCycle));
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
  const [assetHistoryAccountOverrides, setAssetHistoryAccountOverrides] =
    useState<AssetHistoryAccountOverrides>({});
  const [excludedCategoryTrendAccountIds, setExcludedCategoryTrendAccountIds] = useState<string[]>(
    [],
  );
  const [expenseTrendScrubMonthByYear, setExpenseTrendScrubMonthByYear] = useState<
    Record<string, string>
  >({});
  const [incomeTrendScrubMonthByYear, setIncomeTrendScrubMonthByYear] = useState<
    Record<string, string>
  >({});
  // The day (or month) picked on the mood chart, per period.
  const [sentimentScrubBucketByPeriod, setSentimentScrubBucketByPeriod] = useState<
    Record<string, string>
  >({});
  // The month picked on the savings-rate chart, per year.
  const [savingsScrubMonthByYear, setSavingsScrubMonthByYear] = useState<Record<string, string>>(
    {},
  );
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
  const [categoryTrendCompareCategoryId, setCategoryTrendCompareCategoryId] = useState<
    string | null
  >(null);
  // "Compare" arms the next category chip tap to add a second line.
  const [isPickingCategoryCompare, setIsPickingCategoryCompare] = useState(false);
  const [lastInsightTypeByGroup, setLastInsightTypeByGroup] = useState<LastInsightTypeByGroup>({});
  const [activeInsightsFilterPicker, setActiveInsightsFilterPicker] =
    useState<InsightsFilterKey | null>(null);
  const [insightsFilterModes, setInsightsFilterModes] = useState<InsightsFilterModes>({});
  const setInsightsFilterMode = useCallback(
    (key: InsightsFilterKey, mode: SelectionFilterMode) =>
      setInsightsFilterModes((previous) => {
        const next = { ...previous };
        if (mode === DEFAULT_SELECTION_FILTER_MODE) delete next[key];
        else next[key] = mode;
        return next;
      }),
    [],
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const closeInsightsFilterPicker = useCallback(() => setActiveInsightsFilterPicker(null), []);
  useEffect(() => {
    if (!isFilterModalOpen) setActiveInsightsFilterPicker(null);
  }, [isFilterModalOpen]);
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);
  const [periodPickerAnchorRect, setPeriodPickerAnchorRect] =
    useState<PeriodPickerAnchorRect | null>(null);
  const [isInsightMenuOpen, setIsInsightMenuOpen] = useState(false);
  const [budgetMonthLabel, setBudgetMonthLabel] = useState('');
  const budgetPagerRef = useRef<BudgetPagerViewHandle>(null);
  // The review page's zoom and exclusions live here so its filter button can
  // sit in the header and its choices ride along in the insights preferences;
  // the page itself still owns which period is selected.
  const [reviewZoom, setReviewZoom] = useState<ReviewZoom>('week');
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>(EMPTY_REVIEW_FILTERS);
  const reviewPagerRef = useRef<ReviewPagerViewHandle>(null);
  const [insightMenuAnchorRect, setInsightMenuAnchorRect] = useState<PeriodPickerAnchorRect | null>(
    null,
  );
  const [isChartScrubbing, setIsChartScrubbing] = useState(false);
  const breakdownHeaderDotPulse = useRef(new RNAnimated.Value(0)).current;
  const insightsTypeSelectorRef = useRef<ViewInstance | null>(null);
  const periodPickerTriggerRef = useRef<ViewInstance | null>(null);
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
  // Per-page chart inputs, reused while scrubbing.
  const trendChartModelCacheRef = useRef(
    new WeakMap<
      object,
      {
        signature: string;
        rateSource: (dateIso: string) => number;
        model: TrendChartModel;
      }
    >(),
  );

  const { width, height } = useContentFrame();
  const { isTablet, panes } = useDeviceLayout();
  const pageWidth = Math.max(1, width);
  const insightsPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  // Open iPhone Duo: charts are drawn in the left pane.
  const effectiveChartBasis = panes
    ? panes.left
    : isTablet
      ? Math.min(width, TABLET_CONTENT_MAX_WIDTH)
      : width;
  // Measured height of the header, which sits over the left pane when split.
  const [splitHeaderHeight, setSplitHeaderHeight] = useState(SPLIT_HEADER_HEIGHT_ESTIMATE);
  const handleSplitHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next > 0) setSplitHeaderHeight(next);
  }, []);
  const chartWidth = Math.max(260, effectiveChartBasis - 76);
  const lineChartWidth = Math.max(260, effectiveChartBasis - INSIGHTS_LINE_CHART_SIDE_INSET * 2);
  const lineChartSectionStyle = useMemo(
    () => ({ marginHorizontal: -INSIGHTS_LINE_CHART_SECTION_BLEED }),
    [],
  );
  // One entry per page, with Breakdown and Trends each standing for their tabs.
  const insightTypeOptions = useMemo(
    () =>
      INSIGHT_MENU_ENTRIES.map((entry) => {
        const iconType: InsightType = isInsightGroupId(entry)
          ? INSIGHT_GROUP_MEMBERS[entry][0]
          : entry;
        const isLocked = isInsightGroupId(entry)
          ? INSIGHT_GROUP_MEMBERS[entry].every((member) => proTrendTypeSet.has(member))
          : proTrendTypeSet.has(entry);
        return {
          value: entry,
          label: String(I18n.t(`insights.${entry}`)),
          icon: renderInsightTypeIcon(iconType),
          badge: !isPro && isLocked ? String(I18n.t('pro.badge')) : undefined,
        };
      }),
    [isPro, proTrendTypeSet],
  );
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const isChartScrubLockedRef = useRef(false);
  const selectedInsightTypeRef = useRef<InsightType>(selectedInsightType);
  const periodPresetByInsightRef = useRef(periodPresetByInsight);
  const [handledActivityBreakdownRequestToken, setHandledActivityBreakdownRequestToken] =
    useState(0);
  const committedPageIndexRef = useRef(INSIGHTS_PAGER_CENTER_INDEX);
  // Mirror of committedPageIndexRef held in React state. The pager maps each slot
  // to a month via `item - committedPageIndex` shifted from `anchorDate`, so the
  // committed index and the anchor date MUST be read from the same render snapshot.
  // Reading the ref during render can tear from `anchorDate` (state) when an
  // external re-render — e.g. logging a transaction refreshes `allTransactions` —
  // lands after the ref advanced but before the paired setAnchorDate flushes,
  // shifting every slot a month (July's data flashing onto June's page). Render
  // reads this state; callbacks keep using the ref for imperative reads.
  const [committedPageIndex, setCommittedPageIndex] = useState(INSIGHTS_PAGER_CENTER_INDEX);
  const commitPageIndex = useCallback((index: number) => {
    committedPageIndexRef.current = index;
    setCommittedPageIndex(index);
  }, []);
  const [headerPreviewPageIndex, setHeaderPreviewPageIndex] = useState(INSIGHTS_PAGER_CENTER_INDEX);
  const headerPreviewPageIndexRef = useRef(INSIGHTS_PAGER_CENTER_INDEX);
  const activeBreakdownSliceIdRef = useRef<string | null>(null);
  const pageScrollRefs = useRef(new Map<number, { current: ScrollViewInstance | null }>());
  const pageDataCacheRef = useRef(new Map<string, InsightPageData>());
  const getPageScrollRef = useCallback((index: number) => {
    const existing = pageScrollRefs.current.get(index);
    if (existing) return existing;
    const next: { current: ScrollViewInstance | null } = { current: null };
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
      periodState: resolveActivityInsightPeriodState(activityBreakdownInsightRequest, monthCycle),
      periodPreset: activityBreakdownInsightRequest.periodPreset,
    };
  }, [activityBreakdownInsightRequest, handledActivityBreakdownRequestToken, monthCycle]);

  useEffect(() => {
    if (!activityBreakdownInsightRequest) return;
    if (activityBreakdownInsightRequest.token <= handledActivityBreakdownRequestToken) {
      return;
    }

    setHandledActivityBreakdownRequestToken(activityBreakdownInsightRequest.token);
    const nextPeriodState = resolveActivityInsightPeriodState(
      activityBreakdownInsightRequest,
      monthCycleRef.current,
    );

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
    // Selecting the requested insight also leaves the budget takeover.
    setSelectedInsightType(targetInsightType);
    commitPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
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
  }, [activityBreakdownInsightRequest, handledActivityBreakdownRequestToken, commitPageIndex]);

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
    const activeMonthCycle = monthCycleRef.current;
    const currentMonthAnchor = financialMonthAnchorForToday(activeMonthCycle);
    const { start: monthStart, endInclusive: monthEnd } = financialMonthRange(
      financialMonthKeyForDate(now, activeMonthCycle),
      activeMonthCycle,
    );
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
      setAnchorDate(currentMonthAnchor);
    }
    setActiveBreakdownSliceId(null);
    setExpenseTrendScrubMonthByYear({});
    setIncomeTrendScrubMonthByYear({});
    setAssetHistoryScrubMonthByYear({});
    setCategoryTrendScrubBucketByPeriod({});
    setSavingsScrubMonthByYear({});
    setSentimentScrubBucketByPeriod({});
    setIsFilterModalOpen(false);
    commitPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
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
  }, [resetToCurrentMonthToken, commitPageIndex]);

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
      if (saved.insightsFilterModes) setInsightsFilterModes(saved.insightsFilterModes);
      if (saved.assetHistoryAccountOverrides) {
        setAssetHistoryAccountOverrides(saved.assetHistoryAccountOverrides);
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
      if (
        saved.excludedReviewAccountIds ||
        saved.excludedReviewExpenseCategoryIds ||
        saved.excludedReviewIncomeCategoryIds ||
        saved.reviewAccountMode ||
        saved.reviewExpenseCategoryMode ||
        saved.reviewIncomeCategoryMode
      ) {
        setReviewFilters({
          excludedAccountIds: saved.excludedReviewAccountIds ?? [],
          excludedExpenseCategoryIds: saved.excludedReviewExpenseCategoryIds ?? [],
          excludedIncomeCategoryIds: saved.excludedReviewIncomeCategoryIds ?? [],
          accountMode: saved.reviewAccountMode ?? DEFAULT_SELECTION_FILTER_MODE,
          expenseCategoryMode: saved.reviewExpenseCategoryMode ?? DEFAULT_SELECTION_FILTER_MODE,
          incomeCategoryMode: saved.reviewIncomeCategoryMode ?? DEFAULT_SELECTION_FILTER_MODE,
        });
      }
      if (Object.prototype.hasOwnProperty.call(saved, 'categoryTrendSelectedCategoryId')) {
        setCategoryTrendSelectedCategoryId(saved.categoryTrendSelectedCategoryId ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(saved, 'categoryTrendCompareCategoryId')) {
        setCategoryTrendCompareCategoryId(saved.categoryTrendCompareCategoryId ?? null);
      }
      if (saved.lastInsightTypeByGroup) setLastInsightTypeByGroup(saved.lastInsightTypeByGroup);
      if (saved.anchorDate) {
        const parsedAnchorDate = parseDateInput(saved.anchorDate);
        if (parsedAnchorDate) {
          const restoredPeriodPreset = getHydratedInsightPeriodPreset(saved);
          setAnchorDate(
            restoredPeriodPreset === 'week' || restoredPeriodPreset === 'custom'
              ? startOfDayDate(parsedAnchorDate)
              : addFinancialMonths(parsedAnchorDate, 0, monthCycleRef.current),
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
      assetHistoryAccountOverrides,
      excludedCategoryTrendAccountIds,
      excludedReviewAccountIds: reviewFilters.excludedAccountIds,
      excludedReviewExpenseCategoryIds: reviewFilters.excludedExpenseCategoryIds,
      excludedReviewIncomeCategoryIds: reviewFilters.excludedIncomeCategoryIds,
      reviewAccountMode: reviewFilters.accountMode,
      reviewExpenseCategoryMode: reviewFilters.expenseCategoryMode,
      reviewIncomeCategoryMode: reviewFilters.incomeCategoryMode,
      insightsFilterModes,
      categoryTrendSelectedCategoryId,
      categoryTrendCompareCategoryId,
      lastInsightTypeByGroup,
    }),
    [
      reviewFilters,
      insightsFilterModes,
      activeCustomDateField,
      anchorDate,
      categoryTrendSelectedCategoryId,
      categoryTrendCompareCategoryId,
      lastInsightTypeByGroup,
      customEnd,
      customStart,
      excludedExpenseTrendAccountIds,
      excludedExpenseTrendExpenseCategoryIds,
      excludedIncomeTrendAccountIds,
      excludedIncomeTrendIncomeCategoryIds,
      assetHistoryAccountOverrides,
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
  // The menu reopens a group (Breakdown, Trends) on the tab last used in it.
  // Declared before the preferences hook on purpose: on the first render this
  // still sees the default page, and the restored map that hydration sets in
  // the same pass must land after it, not be overwritten by it.
  useEffect(() => {
    const groupId = insightGroupOf(selectedInsightType);
    if (!groupId) return;
    setLastInsightTypeByGroup((previous) =>
      previous[groupId] === selectedInsightType
        ? previous
        : { ...previous, [groupId]: selectedInsightType },
    );
  }, [selectedInsightType]);
  usePersistedJsonSnapshot<InsightsPreferencesSnapshot, Partial<InsightsPreferencesSnapshot>>({
    isLoading,
    storedJson: insightsPreferencesJson,
    snapshot: insightsPreferencesSnapshot,
    parseStoredJson: parseInsightsPreferencesPayload,
    applyParsedSnapshot: applyInsightsPreferencesSnapshot,
    writeStoredJson: updateInsightsPreferencesJson,
  });

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
  // The category chips, biggest spend first; the first is the default chart.
  const categoryTrendChipOptions = useMemo<CategoryTrendCategoryOption[]>(() => {
    if (categoryTrendCategoryOptions.length === 0) return [];
    const totalsByRootId = new Map<string, number>();
    allTransactions.forEach((tx) => {
      if (!countsAsExpenseRow(tx) || !tx.categoryId) return;
      if (!countsTowardSpending(tx, settings.reimbursementsCountAsExpense)) return;
      // Compare categories in the reporting currency; ranking raw entered
      // amounts lets a small foreign-currency category outrank a bigger one.
      const value = tx.reportingAmount ?? tx.amount;
      if (!Number.isFinite(value) || value <= 0) return;
      const category = categoryById.get(tx.categoryId);
      const rootId = category?.parentId ?? tx.categoryId;
      totalsByRootId.set(rootId, (totalsByRootId.get(rootId) ?? 0) + value);
    });
    return categoryTrendCategoryOptions
      .map((option, index) => ({ option, index, total: totalsByRootId.get(option.id) ?? 0 }))
      .sort((a, b) => b.total - a.total || a.index - b.index)
      .map((entry) => entry.option);
  }, [
    allTransactions,
    categoryById,
    categoryTrendCategoryOptions,
    settings.reimbursementsCountAsExpense,
  ]);
  const defaultCategoryTrendCategoryId = categoryTrendChipOptions[0]?.id ?? null;
  // A saved category that has since been deleted falls back to the default.
  const effectiveCategoryTrendCategoryId =
    categoryTrendSelectedCategoryId &&
    categoryTrendCategoryOptions.some((option) => option.id === categoryTrendSelectedCategoryId)
      ? categoryTrendSelectedCategoryId
      : defaultCategoryTrendCategoryId;
  // A comparison only stands while both categories exist and differ.
  const effectiveCategoryTrendCompareId =
    categoryTrendCompareCategoryId &&
    categoryTrendCompareCategoryId !== effectiveCategoryTrendCategoryId &&
    categoryTrendCategoryOptions.some((option) => option.id === categoryTrendCompareCategoryId)
      ? categoryTrendCompareCategoryId
      : null;
  // A chip tap charts that category, or, while "Compare" is armed, adds it as
  // the second line. Picking the compared category as the main one swaps them.
  const handleCategoryChipSelect = useCallback(
    (categoryId: string) => {
      void triggerHaptic('selection');
      if (isPickingCategoryCompare) {
        setIsPickingCategoryCompare(false);
        if (categoryId !== effectiveCategoryTrendCategoryId) {
          setCategoryTrendCompareCategoryId(categoryId);
        }
        return;
      }
      if (categoryId === effectiveCategoryTrendCategoryId) return;
      if (categoryId === effectiveCategoryTrendCompareId) {
        setCategoryTrendCompareCategoryId(effectiveCategoryTrendCategoryId);
      }
      setCategoryTrendSelectedCategoryId(categoryId);
    },
    [effectiveCategoryTrendCategoryId, effectiveCategoryTrendCompareId, isPickingCategoryCompare],
  );
  const handleToggleCategoryCompare = useCallback(() => {
    void triggerHaptic('selection');
    setIsPickingCategoryCompare((previous) => !previous);
  }, []);
  const handleRemoveCategoryCompare = useCallback(() => {
    void triggerHaptic('selection');
    setIsPickingCategoryCompare(false);
    setCategoryTrendCompareCategoryId(null);
  }, []);
  // An armed "Compare" only lasts while the Category trend is on screen.
  useEffect(() => {
    if (selectedInsightType !== 'category_trend') setIsPickingCategoryCompare(false);
  }, [selectedInsightType]);
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

    allTransactions.forEach((raw) => {
      // A loan repayment the borrower asked to count as spending arrives here
      // reshaped as an expense on the funding account, so every page below
      // handles it as the expense it is being reported as. Every other
      // transfer drops out, as it always has.
      const transaction = asSpendingRow(raw);
      if (transaction.type === 'transfer') return;
      // Every page fed from here is a spending readout, so a reimbursement
      // drops out once at the source. Asset history reads `allTransactions`
      // directly and is deliberately left alone: the money did move.
      if (!countsTowardSpending(transaction, settings.reimbursementsCountAsExpense)) return;
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
  }, [allTransactions, effectiveSelectedAccountIdSet, settings.reimbursementsCountAsExpense]);
  // The home-screen savings widgets build the very same predicate, so the
  // widget and this chart cannot disagree about what a filter keeps.
  const includeInSavings = useMemo(
    () =>
      buildSavingsIncludePredicate(
        categories,
        excludedSavingsIncomeCategoryIds,
        excludedSavingsExpenseCategoryIds,
        filterModeOf(insightsFilterModes, 'savingsIncomeCategories'),
        filterModeOf(insightsFilterModes, 'savingsExpenseCategories'),
      ),
    [
      categories,
      excludedSavingsIncomeCategoryIds,
      excludedSavingsExpenseCategoryIds,
      insightsFilterModes,
    ],
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
  const excludedAssetHistoryAccountIds = useMemo(
    () => assetHistoryExcludedAccountIds(accounts, assetHistoryAccountOverrides),
    [accounts, assetHistoryAccountOverrides],
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
  // Asset history already stores a show/hide choice for every account, so its
  // mode only changes which side of that choice the row counts and the picker
  // ticks: the hidden accounts when excluding, the shown ones when including.
  // Including everything reads as an empty pick ("All"), like the other rows.
  const assetHistoryIncludeMode =
    filterModeOf(insightsFilterModes, 'assetHistoryAccounts') === 'include';
  const assetHistoryPickedAccountIds = useMemo(() => {
    if (!assetHistoryIncludeMode) return excludedAssetHistoryAccountIds;
    if (excludedAssetHistoryAccountIds.length === 0) return [];
    const hidden = new Set(excludedAssetHistoryAccountIds);
    return assetHistoryAccountOptions
      .filter((account) => !hidden.has(account.id))
      .map((account) => account.id);
  }, [assetHistoryAccountOptions, assetHistoryIncludeMode, excludedAssetHistoryAccountIds]);
  const includedAssetHistoryAccounts = useMemo(
    () =>
      assetHistoryAccountOptions.filter(
        (account) => !isAssetHistoryAccountExcluded(account, assetHistoryAccountOverrides),
      ),
    [assetHistoryAccountOptions, assetHistoryAccountOverrides],
  );
  // Balances by month in each account's own terms, built the way the Accounts
  // tab builds today's balance so the chart's latest point lands on its Net
  // Assets figure. Only rebuilt while the chart is the insight on screen.
  const assetHistoryLedger = useMemo(() => {
    if (selectedInsightType !== 'asset_history') return EMPTY_ASSET_HISTORY_LEDGER;
    return buildAssetHistoryLedger({
      accounts: includedAssetHistoryAccounts,
      transactions: allTransactions,
      monthKeyOf: (transaction) =>
        transactionMonthKeyById.get(transaction.id) ??
        financialMonthKeyForIso(transaction.date, monthCycle),
    });
  }, [
    allTransactions,
    includedAssetHistoryAccounts,
    selectedInsightType,
    transactionMonthKeyById,
    monthCycle,
  ]);
  const reportingCurrency = settings.currencyCode ?? rateTable.base;
  const toAssetHistoryReportingCurrency = useCallback(
    (amount: number, currency: string) => {
      // Same fallback as AppContext's converted balances: without a rate the
      // native figure is used rather than dropping the account.
      const { value, rateUsed } = convert(amount, currency, reportingCurrency, rateTable);
      return rateUsed === null ? amount : value;
    },
    [rateTable, reportingCurrency],
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
        anchorDate: addPeriodBySteps(state.anchorDate, preset, steps, monthCycle),
        customStart: state.customStart,
        customEnd: state.customEnd,
      };
    },
    [monthCycle],
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
        monthCycle,
      );
      // Budget and review render their own full-page takeover, never the period
      // pager, so this cached page is never displayed — return an empty
      // breakdown to keep it cheap (no transaction scan) and well-typed.
      if (insightType === 'budget' || insightType === 'review') {
        return {
          kind: 'breakdown',
          range,
          categoryRows: [],
          filteredForRange: [],
          breakdownTransactionsById: new Map(),
          transactionType: 'expense',
        };
      }
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
          label: yearKey,
          totalExpense: 0,
          transactionCount: 0,
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
            label: monthLabels[monthIndex] ?? '',
            totalExpense: 0,
            transactionCount: 0,
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
            label: dayLabelShort(dk, activeLocale),
            totalExpense: 0,
            transactionCount: 0,
            transactions: [],
          }));
        }

        const monthRowByKey = new Map(monthRowsSeed.map((row) => [row.monthKey, row]));
        const filteredForRange: TransactionWithRelations[] = [];

        const accountMode = filterModeOf(insightsFilterModes, 'expenseTrendAccounts');
        const categoryMode = filterModeOf(insightsFilterModes, 'expenseTrendExpenseCategories');
        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense') return;
          if (!passesSelectionFilter(accountMode, excludedExpenseTrendAccountSet, [tx.accountId])) {
            return;
          }
          if (
            !passesSelectionFilter(
              categoryMode,
              excludedExpenseTrendExpenseCategorySet,
              categoryFilterIds(tx.categoryId, categoryById),
            )
          ) {
            return;
          }
          const value =
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isLifetime
            ? (
                transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle)
              ).slice(0, 4)
            : isYearPeriod
              ? (transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle))
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
        });

        const orderedSeedRows = isLifetime
          ? fillLifetimeYearRows(monthRowByKey, makeEmptyExpenseYearRow)
          : monthRowsSeed;

        const monthRows = orderedSeedRows.map((row) =>
          row.transactions.length < 2
            ? row
            : { ...row, transactions: sortTransactionsNewestFirst(row.transactions) },
        );

        return {
          kind: 'expense_trend',
          year,
          periodKey,
          granularity,
          range,
          filteredForRange,
          monthRows,
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
          label: yearKey,
          totalIncome: 0,
          transactionCount: 0,
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
            label: monthLabels[monthIndex] ?? '',
            totalIncome: 0,
            transactionCount: 0,
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
            label: dayLabelShort(dk, activeLocale),
            totalIncome: 0,
            transactionCount: 0,
            transactions: [],
          }));
        }

        const monthRowByKey = new Map(monthRowsSeed.map((row) => [row.monthKey, row]));
        const filteredForRange: TransactionWithRelations[] = [];

        const accountMode = filterModeOf(insightsFilterModes, 'incomeTrendAccounts');
        const categoryMode = filterModeOf(insightsFilterModes, 'incomeTrendIncomeCategories');
        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'income') return;
          if (!passesSelectionFilter(accountMode, excludedIncomeTrendAccountSet, [tx.accountId])) {
            return;
          }
          if (
            !passesSelectionFilter(
              categoryMode,
              excludedIncomeTrendIncomeCategorySet,
              categoryFilterIds(tx.categoryId, categoryById),
            )
          ) {
            return;
          }
          const value =
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isLifetime
            ? (
                transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle)
              ).slice(0, 4)
            : isYearPeriod
              ? (transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle))
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
        });

        const orderedSeedRows = isLifetime
          ? fillLifetimeYearRows(monthRowByKey, makeEmptyIncomeYearRow)
          : monthRowsSeed;

        const monthRows = orderedSeedRows.map((row) =>
          row.transactions.length < 2
            ? row
            : { ...row, transactions: sortTransactionsNewestFirst(row.transactions) },
        );

        return {
          kind: 'income_trend',
          year,
          periodKey,
          granularity,
          range,
          filteredForRange,
          monthRows,
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
          label: yearKey,
          totalExpense: 0,
          transactionCount: 0,
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
            label: monthLabels[monthIndex] ?? '',
            totalExpense: 0,
            transactionCount: 0,
            transactions: [],
          }));
        } else {
          const dayKeys = generateDayKeysForRange(range.start, range.end);
          monthRowsSeed = dayKeys.map((dk) => ({
            monthKey: dk,
            axisLabel: dayNumberLabel(dk),
            label: dayLabelShort(dk, activeLocale),
            totalExpense: 0,
            transactionCount: 0,
            transactions: [],
          }));
        }

        const monthRowByKey = new Map(monthRowsSeed.map((row) => [row.monthKey, row]));
        const compareCategoryId =
          effectiveCategoryTrendCompareId && effectiveCategoryTrendCompareId !== selectedCategoryId
            ? effectiveCategoryTrendCompareId
            : null;
        // The compared category gets its own buckets with the same keys.
        const compareRowByKey = compareCategoryId
          ? new Map(
              monthRowsSeed.map((row) => [
                row.monthKey,
                { ...row, transactions: [] as TransactionWithRelations[] },
              ]),
            )
          : null;
        const filteredForRange: TransactionWithRelations[] = [];

        const accountMode = filterModeOf(insightsFilterModes, 'categoryTrendAccounts');
        inRangeTransactions.forEach((tx) => {
          if (tx.type !== 'expense' || !tx.categoryId || !selectedCategoryId) return;
          if (
            !passesSelectionFilter(accountMode, excludedCategoryTrendAccountSet, [tx.accountId])
          ) {
            return;
          }
          const category = categoryById.get(tx.categoryId);
          const rootCategoryId = category?.parentId ?? tx.categoryId;
          const isCompare = compareRowByKey !== null && rootCategoryId === compareCategoryId;
          if (rootCategoryId !== selectedCategoryId && !isCompare) return;
          const rowByKey = isCompare && compareRowByKey ? compareRowByKey : monthRowByKey;

          const value =
            settings.displayMode === 'time'
              ? getDisplayValueForTransaction(tx)
              : (tx.reportingAmount ?? tx.amount);
          if (!Number.isFinite(value) || value <= 0) return;

          const rowKey = isLifetime
            ? (
                transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle)
              ).slice(0, 4)
            : isYearPeriod
              ? (transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle))
              : (transactionDayKeyById.get(tx.id) ?? dayKeyFromIsoLocal(tx.date));
          let monthRow = rowByKey.get(rowKey);
          if (!monthRow) {
            if (!isLifetime) return;
            monthRow = makeEmptyCategoryYearRow(rowKey);
            rowByKey.set(rowKey, monthRow);
          }

          filteredForRange.push(tx);
          monthRow.totalExpense += value;
          monthRow.transactionCount += 1;
          monthRow.transactions.push(tx);
        });

        // Lifetime buckets are the years either category has data in, so both
        // lines share one axis.
        if (isLifetime && compareRowByKey) {
          compareRowByKey.forEach((_, key) => {
            if (!monthRowByKey.has(key)) monthRowByKey.set(key, makeEmptyCategoryYearRow(key));
          });
          monthRowByKey.forEach((_, key) => {
            if (!compareRowByKey.has(key)) compareRowByKey.set(key, makeEmptyCategoryYearRow(key));
          });
        }
        const orderedSeedRows = isLifetime
          ? fillLifetimeYearRows(monthRowByKey, makeEmptyCategoryYearRow)
          : monthRowsSeed;
        const compareMonthRows = compareRowByKey
          ? orderedSeedRows.map(
              (row) => compareRowByKey.get(row.monthKey) ?? makeEmptyCategoryYearRow(row.monthKey),
            )
          : null;

        // Sort each bucket's transactions newest-first so the selected-bucket
        // list renders without re-sorting on every render (page data is cached).
        const monthRows = orderedSeedRows.map((row) => {
          if (row.transactions.length < 2) return row;
          return {
            ...row,
            transactions: sortTransactionsNewestFirst(row.transactions),
          };
        });

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
          compareCategoryId,
          compareMonthRows,
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
            const monthKey =
              transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle);
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

        const todayDayKey = dayKeyFromDateLocal(new Date());
        const monthRows = monthRowsSeed.map((seedRow) => ({
          ...seedRow,
          totalAssets: assetHistoryTotalForMonth(assetHistoryLedger, {
            monthKey: seedRow.monthKey,
            monthEndDayKey: dayKeyFromDateLocal(
              financialMonthRange(seedRow.monthKey, monthCycle).endInclusive,
            ),
            todayDayKey,
            toReportingCurrency: toAssetHistoryReportingCurrency,
          }),
        }));

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

          if (!includeInSavings(tx)) return;

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

          const monthKey =
            transactionMonthKeyById.get(tx.id) ?? financialMonthKeyForIso(tx.date, monthCycle);
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
          sortTransactionsNewestFirst(row.transactions);
        });
        savingsRateRows.forEach((row) => {
          row.net = row.income - row.expense;
          row.savingsRate = row.income > 0 ? row.net / row.income : null;
          if (row.transactions.length < 2) return;
          sortTransactionsNewestFirst(row.transactions);
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
      const breakdownFilterMode = filterModeOf(
        insightsFilterModes,
        transactionType === 'expense' ? 'expenseBreakdownCategories' : 'incomeBreakdownCategories',
      );
      const passesBreakdownFilter = (tx: TransactionWithRelations) =>
        tx.type === transactionType &&
        passesSelectionFilter(
          breakdownFilterMode,
          breakdownExclusionSet,
          categoryFilterIds(tx.categoryId, categoryById),
        );
      const breakdownValueOf = (tx: TransactionWithRelations) =>
        settings.displayMode === 'time'
          ? getDisplayValueForTransaction(tx)
          : (tx.reportingAmount ?? tx.amount);
      const filteredForRange: TransactionWithRelations[] = [];
      const breakdownTotals = new Map<
        string,
        { id: string; label: string; amount: number; count: number; emoji: string }
      >();
      const breakdownTransactionsById = new Map<string, TransactionWithRelations[]>();
      inRangeTransactions.forEach((tx) => {
        if (!passesBreakdownFilter(tx)) return;
        filteredForRange.push(tx);

        const id = resolveBreakdownRootId(tx, categoryById);
        const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
        const root = category?.parentId ? categoryById.get(category.parentId) : category;
        const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
        const label = String(root?.name ?? fallbackRootLabel ?? I18n.t('common.uncategorized'));
        const emoji = root?.icon ?? tx.categoryIcon ?? '•';
        const value = breakdownValueOf(tx);

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
      assetHistoryLedger,
      categoryById,
      categoryTrendCategoryOptions,
      effectiveCategoryTrendCategoryId,
      effectiveCategoryTrendCompareId,
      excludedExpenseTrendAccountSet,
      excludedExpenseTrendExpenseCategorySet,
      excludedIncomeTrendAccountSet,
      excludedIncomeTrendIncomeCategorySet,
      includeInSavings,
      excludedExpenseBreakdownCategorySet,
      excludedIncomeBreakdownCategorySet,
      excludedCategoryTrendAccountSet,
      insightsFilterModes,
      getDisplayValueForTransaction,
      includedAssetHistoryAccounts,
      toAssetHistoryReportingCurrency,
      activeLocale,
      settings.displayMode,
      transactionDayKeyById,
      transactionMonthKeyById,
      weekStartsOn,
      monthCycle,
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
  const displayInsightGroup: InsightGroupId | null = insightGroupOf(displaySelectedInsightType);
  const insightGroupTabOptions = useMemo(
    () =>
      displayInsightGroup
        ? INSIGHT_GROUP_MEMBERS[displayInsightGroup].map((member) => ({
            value: member,
            label: String(I18n.t(`insights.tabs.${member}`)),
            // Trends picks what to chart from an icon row; Breakdown's two
            // tabs stay plain text.
            icon:
              displayInsightGroup === 'trends'
                ? UTILITY_ICON_SOURCES[INSIGHT_TYPE_ICON_NAME[member]]
                : undefined,
          }))
        : [],
    // Rebuilt on a language change, since the labels are read through I18n.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayInsightGroup, activeLocale],
  );
  // Budget is a first-class insight type that renders a full-page takeover:
  // it swaps the pager body and drives the header's month controls. Keyed on
  // the *display* type so the header and body stay consistent through an
  // in-flight activity-breakdown transition (which points display away from a
  // still-selected budget for one render).
  const isBudgetView = displaySelectedInsightType === 'budget';
  const isReviewView = displaySelectedInsightType === 'review';
  // Both takeovers replace the pager body and drive the header's controls.
  const isTakeoverView = isBudgetView || isReviewView;
  // Open iPhone Duo. The paged insights split across the panes, with the
  // header over the left one; Budget, Review and the locked Pro preview are
  // single pages, so they sit in a readable column instead.
  const isLockedProTrend = !isPro && proTrendTypeSet.has(displaySelectedInsightType);
  const splitPanes = panes && !isLoading && !isTakeoverView && !isLockedProTrend ? panes : null;
  const column = readableColumn(width, panes !== null && splitPanes === null);
  const insightsSplit = useMemo<InsightsSplit | null>(
    () =>
      splitPanes
        ? { left: splitPanes.left, right: splitPanes.right, top: splitHeaderHeight, height }
        : null,
    [splitPanes, splitHeaderHeight, height],
  );
  const displayPeriodPreset = pendingActivityBreakdownTarget
    ? (pendingActivityBreakdownTarget.periodPreset ??
      getInsightFilterConfig(pendingActivityBreakdownTarget.insightType).fixedPeriodPreset ??
      'month')
    : effectivePeriodPreset;
  const displayCurrentPeriodState =
    pendingActivityBreakdownTarget?.periodState ?? currentPeriodState;
  const displayCommittedPageIndex = pendingActivityBreakdownTarget
    ? INSIGHTS_PAGER_CENTER_INDEX
    : committedPageIndex;
  const displayHeaderPreviewPageIndex = pendingActivityBreakdownTarget
    ? INSIGHTS_PAGER_CENTER_INDEX
    : headerPreviewPageIndex;
  // Leaving the budget takeover remounts the period pager at its center slot
  // (initialScrollIndex), so realign the committed/preview indices — otherwise
  // the first swipe back computes its step count from a stale offset and jumps
  // several periods at once.
  useEffect(() => {
    if (isTakeoverView) return;
    commitPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
    headerPreviewPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    setHeaderPreviewPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
  }, [isTakeoverView, commitPageIndex]);
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
        monthCycle,
      ),
    [displayPeriodPreset, headerPreviewPeriodState, weekStartsOn, monthCycle],
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
            value={formatHours(value, settings)}
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
  const formatAxisCurrencyValue = useCallback(
    (value: number) =>
      `${value < 0 ? '-' : ''}${formatCompactCurrency(Math.abs(value), settings.currencySymbol)}`,
    [settings.currencySymbol],
  );
  const formatPercentValue = useCallback(
    (value: number) => formatSavingsRatePercentLabel(value),
    [],
  );
  const formatPercentAxisValue = useCallback((value: number) => `${Math.round(value)}%`, []);
  const formatCountValue = useCallback((value: number) => String(Math.round(value)), []);
  const formatTrendTooltipValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? `${value < 0 ? '-' : ''}${formatHours(Math.abs(value), settings)}`
        : formatAmount(value, settings),
    [settings],
  );
  const formatAxisAssetValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? `${value < 0 ? '-' : ''}${formatHours(Math.abs(value), settings)}`
        : formatAxisCurrencyValue(value),
    [formatAxisCurrencyValue, settings],
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
  usePagerWidthResnap(horizontalListRef, pageWidth, committedPageIndexRef);

  const commitInsightsPageByIndex = useCallback(
    (nextIndex: number) => {
      const clampedIndex = clampInsightsPageIndex(nextIndex);
      const currentIndex = committedPageIndexRef.current;
      const steps = getPeriodPagerCommitSteps({
        renderedIndex: committedPageIndex,
        committedIndex: currentIndex,
        targetIndex: clampedIndex,
      });
      if (steps === null) {
        headerPreviewPageIndexRef.current = currentIndex;
        setHeaderPreviewPageIndex(currentIndex);
        return;
      }
      const nextState = shiftPeriodStateBySteps(currentPeriodState, steps, effectivePeriodPreset);
      commitPageIndex(clampedIndex);
      headerPreviewPageIndexRef.current = clampedIndex;
      setHeaderPreviewPageIndex(clampedIndex);
      setAnchorDate(nextState.anchorDate);
      setCustomStart(nextState.customStart);
      setCustomEnd(nextState.customEnd);
    },
    [
      clampInsightsPageIndex,
      commitPageIndex,
      committedPageIndex,
      currentPeriodState,
      effectivePeriodPreset,
      shiftPeriodStateBySteps,
    ],
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
    commitPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
    headerPreviewPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    setHeaderPreviewPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
    pageScrollRefs.current.forEach((ref) => ref.current?.scrollTo({ y: 0, animated: false }));
    requestAnimationFrame(() => {
      horizontalListRef.current?.scrollToIndex({
        index: INSIGHTS_PAGER_CENTER_INDEX,
        animated: false,
      });
    });
  }, [commitPageIndex]);

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
      color: chartCategoryColor(i),
    })) satisfies BreakdownPieSlice[];
    const activeSlice = activeBreakdownSliceId
      ? (pagePieData.find((item) => item.id === activeBreakdownSliceId) ?? null)
      : null;
    const pieLayoutBleed = Math.max(24, spacing.screenHorizontal * 2);
    const pieSideMargin = 14;
    // The pie lives in the left pane on the open iPhone Duo.
    const pieBasisWidth = panes ? panes.left : pageWidth;
    const pieLayoutWidth = Math.max(chartWidth, pieBasisWidth + pieLayoutBleed - pieSideMargin * 2);
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
        labelIconSource: PieLabelIconSource | null;
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
      const labelIconSource = pieLabelIconSource(item.emoji);
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
      <InsightPaneSplit
        className="gap-1"
        primary={
          <>
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
                      {...REPLAY_PRIVATE}
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
                                {style.labelIconSource?.kind === 'sprite' ? (
                                  <>
                                    <ClipPath id={`pie-label-icon-${label.id}`}>
                                      <Rect
                                        x={pieLabelWidth / 2 - 7}
                                        y={-16}
                                        width={14}
                                        height={14}
                                      />
                                    </ClipPath>
                                    <G clipPath={`url(#pie-label-icon-${label.id})`}>
                                      <SvgImage
                                        href={style.labelIconSource.sprite.atlas.source}
                                        x={
                                          pieLabelWidth / 2 -
                                          7 -
                                          style.labelIconSource.sprite.column * 14
                                        }
                                        y={-16 - style.labelIconSource.sprite.row * 14}
                                        width={
                                          (style.labelIconSource.sprite.atlas.width * 14) /
                                          CATEGORY_ICON_CELL_SIZE
                                        }
                                        height={
                                          (style.labelIconSource.sprite.atlas.height * 14) /
                                          CATEGORY_ICON_CELL_SIZE
                                        }
                                        preserveAspectRatio="none"
                                      />
                                    </G>
                                  </>
                                ) : style.labelIconSource?.kind === 'image' ? (
                                  <SvgImage
                                    href={style.labelIconSource.source}
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
                                    : `${categoryIconToEmoji(style.emoji)} ${style.categoryLabel}`.trim()}
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
          </>
        }
        secondary={
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
                  accessibilityLabel={`${categoryIconToEmoji(item.emoji)} ${item.name}`.trim()}
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
        }
      />
    );
  };

  // ---- Trends: one line-and-point chart page for expense, income, category and assets ----
  const currentTrendMonthKey = financialMonthKeyForDate(new Date(), monthCycle);
  const currentTrendDayKey = dayKeyFromDateLocal(new Date());
  // A bucket after today has not happened: it gets no point, so the line ends
  // at the current month instead of dropping to zero for the rest of the year.
  const isFutureTrendBucket = (bucketKey: string) => {
    if (bucketKey.length === 7) return bucketKey > currentTrendMonthKey;
    if (bucketKey.length === 10) return bucketKey > currentTrendDayKey;
    if (bucketKey.length === 4) return bucketKey > currentTrendMonthKey.slice(0, 4);
    return false;
  };
  const isCurrentTrendBucket = (bucketKey: string) =>
    bucketKey === currentTrendMonthKey ||
    bucketKey === currentTrendDayKey ||
    bucketKey === currentTrendMonthKey.slice(0, 4);
  const trendBucketTitle = (bucketKey: string, fallback: string) => {
    if (bucketKey.length === 7) return monthShortYearLabel(bucketKey, activeLocale);
    return fallback;
  };
  const trendModelSignature = [
    currentTrendMonthKey,
    currentTrendDayKey,
    activeLocale,
    settings.displayMode,
    themeColors.primary,
  ].join('|');

  // Chart inputs depend only on the (cached) page data, so they are built once
  // per page and reused while the user scrubs: the chart then redraws only its
  // selection, not every path.
  const getTrendChartModel = (pageData: InsightPageData): TrendChartModel | null => {
    const cached = trendChartModelCacheRef.current.get(pageData);
    if (
      cached &&
      cached.signature === trendModelSignature &&
      cached.rateSource === getTrueHourlyRateForDate
    ) {
      return cached.model;
    }
    let model: TrendChartModel | null = null;
    const transactionsByKey = new Map<string, TransactionWithRelations[]>();
    if (pageData.kind === 'expense_trend' || pageData.kind === 'income_trend') {
      const isExpense = pageData.kind === 'expense_trend';
      const rows: (ExpenseTrendMonthRow | IncomeTrendMonthRow)[] = pageData.monthRows;
      const values = rows.map((row) =>
        isFutureTrendBucket(row.monthKey)
          ? null
          : 'totalExpense' in row
            ? row.totalExpense
            : row.totalIncome,
      );
      rows.forEach((row) => transactionsByKey.set(row.monthKey, row.transactions));
      model = {
        buckets: rows.map((row) => ({
          key: row.monthKey,
          label: row.axisLabel,
          title: trendBucketTitle(row.monthKey, row.label),
        })),
        series: [
          {
            key: pageData.kind,
            label: String(I18n.t(`insights.tabs.${pageData.kind}`)),
            color: isExpense
              ? INSIGHT_TYPE_VISUALS.expense_trend.tint
              : INSIGHT_TYPE_VISUALS.income_trend.tint,
            values,
          },
        ],
        values,
        compareValues: null,
        transactionsByKey,
      };
    } else if (pageData.kind === 'category_trend') {
      const labelOf = (id: string | null) =>
        pageData.selectableCategories.find((option) => option.id === id)?.label ?? '';
      const values = pageData.monthRows.map((row) =>
        isFutureTrendBucket(row.monthKey) ? null : row.totalExpense,
      );
      const compareRows = pageData.compareMonthRows;
      const compareValues = compareRows
        ? compareRows.map((row) => (isFutureTrendBucket(row.monthKey) ? null : row.totalExpense))
        : null;
      pageData.monthRows.forEach((row, index) => {
        const compareTransactions = compareRows?.[index]?.transactions ?? [];
        transactionsByKey.set(
          row.monthKey,
          compareTransactions.length === 0
            ? row.transactions
            : sortTransactionsNewestFirst([...row.transactions, ...compareTransactions]),
        );
      });
      const series: TrendLineChartSeries[] = [
        {
          key: 'primary',
          label: labelOf(pageData.selectedCategoryId),
          color: CATEGORY_TREND_PRIMARY_COLOR,
          values,
        },
      ];
      if (compareValues) {
        series.push({
          key: 'compare',
          label: labelOf(pageData.compareCategoryId),
          color: CATEGORY_TREND_COMPARE_COLOR,
          values: compareValues,
        });
      }
      model = {
        buckets: pageData.monthRows.map((row) => ({
          key: row.monthKey,
          label: row.axisLabel,
          title: trendBucketTitle(row.monthKey, row.label),
        })),
        series,
        values,
        compareValues,
        transactionsByKey,
      };
    } else if (pageData.kind === 'asset_history') {
      const values = pageData.monthRows.map((row) => {
        if (isFutureTrendBucket(row.monthKey)) return null;
        if (settings.displayMode !== 'time') return row.totalAssets;
        const rate = getTrueHourlyRateForDate(`${row.monthKey}-15T12:00:00`);
        return amountToHoursByRate(row.totalAssets, rate);
      });
      model = {
        buckets: pageData.monthRows.map((row) => ({
          key: row.monthKey,
          label: row.label,
          title: trendBucketTitle(row.monthKey, row.label),
        })),
        series: [
          {
            key: 'asset_history',
            label: String(I18n.t('insights.tabs.asset_history')),
            color: themeColors.primary,
            values,
          },
        ],
        values,
        compareValues: null,
        transactionsByKey,
      };
    }
    if (model) {
      trendChartModelCacheRef.current.set(pageData, {
        signature: trendModelSignature,
        rateSource: getTrueHourlyRateForDate,
        model,
      });
    }
    return model;
  };

  // The savings-rate page charts each month's rate with the trends' chart.
  const getSavingsChartModel = (pageData: AnalyticsPageData): TrendChartModel => {
    const cached = trendChartModelCacheRef.current.get(pageData);
    if (cached && cached.signature === trendModelSignature) return cached.model;
    const values = pageData.savingsRateRows.map((row) =>
      isFutureTrendBucket(row.monthKey) || row.savingsRate === null
        ? null
        : Math.round(row.savingsRate * 1000) / 10,
    );
    const model: TrendChartModel = {
      buckets: pageData.savingsRateRows.map((row) => ({
        key: row.monthKey,
        label: row.label,
        title: trendBucketTitle(row.monthKey, row.label),
      })),
      series: [
        {
          key: 'savings_rate',
          label: String(I18n.t('insights.savings_rate')),
          color: themeColors.success,
          values,
        },
      ],
      values,
      compareValues: null,
      transactionsByKey: new Map(),
    };
    trendChartModelCacheRef.current.set(pageData, {
      signature: trendModelSignature,
      rateSource: getTrueHourlyRateForDate,
      model,
    });
    return model;
  };

  // Expense Sentiment charts each mood's count per day (or month).
  const getSentimentChartModel = (pageData: ExpenseSentimentPageData): TrendChartModel => {
    const cached = trendChartModelCacheRef.current.get(pageData);
    if (cached && cached.signature === trendModelSignature) return cached.model;
    const valuesFor = (mood: 'happy' | 'neutral' | 'sad') =>
      pageData.dayRows.map((row) => (isFutureTrendBucket(row.dayKey) ? null : row[mood]));
    const happy = valuesFor('happy');
    const model: TrendChartModel = {
      buckets: pageData.dayRows.map((row) => ({
        key: row.dayKey,
        label: row.label,
        title: trendBucketTitle(
          row.dayKey,
          row.subLabel ? `${row.label} ${row.subLabel}` : row.label,
        ),
      })),
      series: [
        {
          key: 'happy',
          label: String(I18n.t('review.mood_happy')),
          color: SENTIMENT_COLORS.happy,
          values: happy,
        },
        {
          key: 'neutral',
          label: String(I18n.t('review.mood_neutral')),
          color: SENTIMENT_COLORS.neutral,
          values: valuesFor('neutral'),
        },
        {
          key: 'sad',
          label: String(I18n.t('review.mood_regret')),
          color: SENTIMENT_COLORS.sad,
          values: valuesFor('sad'),
        },
      ],
      values: happy,
      compareValues: null,
      transactionsByKey: new Map(),
    };
    trendChartModelCacheRef.current.set(pageData, {
      signature: trendModelSignature,
      rateSource: getTrueHourlyRateForDate,
      model,
    });
    return model;
  };

  const trendScrubSelection = (kind: TrendKind, periodKey: string): string | null => {
    const record =
      kind === 'expense'
        ? expenseTrendScrubMonthByYear
        : kind === 'income'
          ? incomeTrendScrubMonthByYear
          : kind === 'category'
            ? categoryTrendScrubBucketByPeriod
            : assetHistoryScrubMonthByYear;
    return record[periodKey] ?? null;
  };
  const selectTrendBucket = (kind: TrendKind, periodKey: string, bucketKey: string) => {
    const [ref, setRecord] =
      kind === 'expense'
        ? [expenseTrendScrubMonthByYearRef, setExpenseTrendScrubMonthByYear]
        : kind === 'income'
          ? [incomeTrendScrubMonthByYearRef, setIncomeTrendScrubMonthByYear]
          : kind === 'category'
            ? [categoryTrendScrubBucketByPeriodRef, setCategoryTrendScrubBucketByPeriod]
            : [assetHistoryScrubMonthByYearRef, setAssetHistoryScrubMonthByYear];
    if (ref.current[periodKey] === bucketKey) return;
    ref.current = { ...ref.current, [periodKey]: bucketKey };
    setRecord((previous) =>
      previous[periodKey] === bucketKey ? previous : { ...previous, [periodKey]: bucketKey },
    );
  };

  // The bucket a page opens on: the latest with activity (or, for a balance,
  // the latest that has happened).
  const defaultTrendBucketKey = (model: TrendChartModel, activeOnly: boolean) => {
    for (let index = model.buckets.length - 1; index >= 0; index -= 1) {
      const value = model.values[index];
      const compareValue = model.compareValues?.[index] ?? null;
      const isValued = (candidate: number | null) =>
        candidate !== null && (!activeOnly || candidate > 0);
      if (isValued(value) || isValued(compareValue)) return model.buckets[index]?.key ?? null;
    }
    return model.buckets[model.buckets.length - 1]?.key ?? null;
  };

  const renderTrendHeadlineValue = (value: number, color: string) =>
    settings.displayMode === 'time' ? (
      <TimeValueInline
        value={`${value < 0 ? '-' : ''}${formatHours(Math.abs(value), settings)}`}
        variant="heading"
        textClassName="text-[28px] leading-[36px] font-black tracking-tight"
        iconColor={color}
        iconSize={22}
        style={{ color }}
      />
    ) : (
      <Text
        variant="heading"
        className="text-[28px] leading-[36px] font-black tracking-tight"
        style={{ color }}
      >
        {formatAmount(value, settings)}
      </Text>
    );

  const renderTrendLinePane = (pageData: InsightPageData, kind: TrendKind) => {
    const model = getTrendChartModel(pageData);
    if (!model) return null;
    const periodKey =
      pageData.kind === 'asset_history'
        ? String(pageData.year)
        : 'periodKey' in pageData
          ? pageData.periodKey
          : '';
    const insightType = TREND_INSIGHT_TYPE_BY_KIND[kind];
    const isBalance = kind === 'asset';
    const isComparing = model.compareValues !== null;
    const accentColor = model.series[0]?.color ?? themeColors.primary;
    const selectedKey =
      model.buckets.find((bucket) => bucket.key === trendScrubSelection(kind, periodKey))?.key ??
      defaultTrendBucketKey(model, !isBalance);
    const selectedIndex = model.buckets.findIndex((bucket) => bucket.key === selectedKey);
    const selectedBucket = model.buckets[selectedIndex];
    const selectedValue = selectedIndex >= 0 ? (model.values[selectedIndex] ?? 0) : 0;
    // The month still under way is not a full month: it stays out of a flow's
    // average (unless it is all there is), so a week in it never reads as
    // far below average.
    const completedSummary = isBalance
      ? null
      : summarizeTrend(
          model.values.map((value, index) =>
            isCurrentTrendBucket(model.buckets[index]?.key ?? '') ? null : value,
          ),
          { activeOnly: true },
        );
    const summary =
      completedSummary && completedSummary.counted > 0
        ? completedSummary
        : summarizeTrend(model.values, { activeOnly: !isBalance });
    // "Higher" is bad news for spending and good news for income and assets.
    const higherIsGood = kind === 'income' || kind === 'asset';
    const goodColor = themeColors.success;
    const badColor = themeColors.error;

    // A quiet pill under the amount: how the selected month compares with
    // the average (or, for assets, how far the balance moved since January).
    let badge: TrendHeadlineBadge | null = null;
    if (isBalance) {
      const firstIndex = model.values.findIndex((value) => value !== null);
      const firstValue = firstIndex >= 0 ? model.values[firstIndex] : null;
      if (firstValue !== null && firstValue !== undefined && selectedIndex > firstIndex) {
        const delta = selectedValue - firstValue;
        const since = model.buckets[firstIndex]?.title ?? '';
        const deltaText =
          settings.displayMode === 'time'
            ? formatHours(Math.abs(delta), settings)
            : formatCompactCurrency(Math.abs(delta), settings.currencySymbol);
        const isFlat = Math.abs(delta) < 0.005;
        badge = {
          text: isFlat
            ? String(I18n.t('insights.trend_stats.flat_since', { period: since }))
            : String(
                I18n.t('insights.trend_stats.change_since', { value: deltaText, period: since }),
              ),
          color: isFlat ? themeColors.textMuted : delta > 0 ? goodColor : badColor,
          direction: isFlat ? null : delta > 0 ? 'up' : 'down',
        };
      }
    } else if (!isComparing && selectedValue > 0) {
      const change = percentChange(selectedValue, summary.average);
      if (change !== null && summary.counted > 1) {
        const percent = Math.round(Math.abs(change));
        const isGood = percent === 0 ? null : change > 0 === higherIsGood;
        badge = {
          text:
            percent === 0
              ? String(I18n.t('insights.trend_stats.at_average'))
              : String(I18n.t('insights.trend_stats.vs_average', { percent })),
          color: isGood === null ? themeColors.textMuted : isGood ? goodColor : badColor,
          direction: percent === 0 ? null : change > 0 ? 'up' : 'down',
        };
      }
    }

    const listKind = kind === 'expense' ? 'expense' : kind === 'income' ? 'income' : 'category';
    const selectedTransactions = selectedKey
      ? (model.transactionsByKey.get(selectedKey) ?? EMPTY_TRANSACTIONS)
      : EMPTY_TRANSACTIONS;

    let compareSummary: React.ReactNode = null;
    if (pageData.kind === 'category_trend' && model.compareValues && model.series[1]) {
      // Both totals cover the same months, the one under way included.
      const firstSummary = summarizeTrend(model.values, { activeOnly: true });
      const secondSummary = summarizeTrend(model.compareValues, { activeOnly: true });
      const comparison = compareCategoryTotals(firstSummary.total, secondSummary.total);
      const first = model.series[0]?.label ?? '';
      const second = model.series[1].label;
      const sentence =
        comparison.kind === 'more'
          ? I18n.t('insights.compare.summary_more', { percent: comparison.percent, first, second })
          : comparison.kind === 'less'
            ? I18n.t('insights.compare.summary_more', {
                percent: comparison.percent,
                first: second,
                second: first,
              })
            : comparison.kind === 'same'
              ? I18n.t('insights.compare.summary_same', { first, second })
              : comparison.kind === 'only_first'
                ? I18n.t('insights.compare.summary_none', { name: second })
                : comparison.kind === 'only_second'
                  ? I18n.t('insights.compare.summary_none', { name: first })
                  : null;
      compareSummary = (
        <TrendCompareSummary
          sentence={sentence ? String(sentence) : null}
          first={{
            label: first,
            color: CATEGORY_TREND_PRIMARY_COLOR,
            total: renderValueNode(firstSummary.total, {
              variant: 'bodyStrong',
              textClassName: 'text-foreground',
              iconColor: themeColors.text,
            }),
          }}
          second={{
            label: second,
            color: CATEGORY_TREND_COMPARE_COLOR,
            total: renderValueNode(secondSummary.total, {
              variant: 'bodyStrong',
              textClassName: 'text-foreground',
              iconColor: themeColors.text,
            }),
          }}
        />
      );
    }

    const hasAnyData =
      pageData.kind === 'asset_history'
        ? pageData.includedAccountsCount > 0 && model.values.some((value) => value !== null)
        : pageData.filteredForRange.length > 0;
    const emptyKey = insightType;
    if (!hasAnyData) {
      if (pageData.kind === 'asset_history') {
        // No accounts picked, or a year that has not started yet.
        const noAccounts = pageData.includedAccountsCount === 0;
        return (
          <EmptyState
            title={
              noAccounts
                ? I18n.t('insights.analytics.asset_history.empty_no_accounts.title')
                : I18n.t('insights.empty.title')
            }
            message={
              noAccounts
                ? I18n.t('insights.analytics.asset_history.empty_no_accounts.message')
                : I18n.t('insights.empty.message')
            }
            mascotMood="curious"
            animateIn={false}
          />
        );
      }
      return (
        <View className="mt-2 gap-3">
          <EmptyState
            title={I18n.t(`insights.analytics.${emptyKey}.no_data_title`)}
            message={I18n.t(`insights.analytics.${emptyKey}.no_data_message`)}
            mascotMood="curious"
            animateIn={false}
          />
        </View>
      );
    }

    const listCountKey = `${listKind}|${periodKey}|${selectedKey ?? ''}`;
    const initialListCount =
      kind === 'category' ? TREND_TRANSACTIONS_INITIAL : TREND_TRANSACTIONS_INITIAL_EXPENSE_INCOME;

    return (
      <InsightPaneSplit
        className="mt-1 gap-3"
        primary={
          <>
            {isComparing ? null : (
              <TrendHeadline
                title={selectedBucket?.title ?? ''}
                value={renderTrendHeadlineValue(
                  selectedValue,
                  isBalance && selectedValue < 0 ? badColor : accentColor,
                )}
                badge={badge}
              />
            )}
            <View
              style={lineChartSectionStyle}
              onTouchStart={lockChartScrub}
              onTouchEnd={unlockChartScrub}
              onTouchCancel={unlockChartScrub}
            >
              <TrendLineChart
                // A new tab or comparison is a new chart: remounting fades it in
                // instead of showing the previous tab's drawing for a frame.
                key={`${pageData.kind}-${isComparing ? 'compare' : 'single'}`}
                buckets={model.buckets}
                series={model.series}
                width={lineChartWidth}
                height={isComparing ? TREND_COMPARE_CHART_HEIGHT : TREND_CHART_HEIGHT}
                selectedKey={selectedKey}
                onSelectKey={(key) => selectTrendBucket(kind, periodKey, key)}
                onGestureStart={lockChartScrub}
                onGestureEnd={unlockChartScrub}
                formatValue={formatTrendTooltipValue}
                formatAxisValue={formatAxisAssetValue}
                averageValue={isBalance || isComparing ? null : summary.average}
                averageLabel={
                  summary.average !== null && !isBalance && !isComparing
                    ? String(
                        I18n.t('insights.trend_stats.average_line', {
                          value: formatAxisAssetValue(summary.average),
                        }),
                      )
                    : undefined
                }
                zeroBased={!isBalance}
                gridColor={withColorAlpha(themeColors.border, isDark ? 0.7 : 0.9)}
                labelColor={themeColors.textMuted}
                surfaceColor={themeColors.background}
                tooltipBackground={themeColors.card}
                tooltipTextColor={themeColors.text}
                accessibilityLabel={String(I18n.t(`insights.${insightType}`))}
              />
            </View>
          </>
        }
        secondary={
          <View className="gap-3">
            {compareSummary}
            {isBalance ? null : (
              <TrendMonthTransactions
                key={`${listKind}-${selectedKey ?? ''}`}
                transactions={selectedTransactions}
                visibleCount={trendListVisibleCounts[listCountKey] ?? initialListCount}
                locale={activeLocale}
                displaySettings={settings}
                reimbursementsCountAsExpense={settings.reimbursementsCountAsExpense}
                getDisplayValueForTransaction={getDisplayValueForTransaction}
                getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                onOpenTransaction={handleTransactionPress}
                onTransactionLongPress={handleTransactionLongPress}
                selectedTransactionIds={selectedTransactionIds}
                selectionMode={isSelectionMode}
                emptyTitle={I18n.t(`insights.analytics.${emptyKey}.no_data_title`)}
                emptyMessage={I18n.t(`insights.analytics.${emptyKey}.no_data_message`)}
              />
            )}
          </View>
        }
      />
    );
  };
  const renderExpenseTrendPane = (pageData: ExpenseTrendPageData) =>
    renderTrendLinePane(pageData, 'expense');
  const renderIncomeTrendPane = (pageData: IncomeTrendPageData) =>
    renderTrendLinePane(pageData, 'income');
  const renderCategoryTrendPane = (pageData: CategoryTrendPageData) =>
    renderTrendLinePane(pageData, 'category');
  const renderAssetHistoryPane = (pageData: AssetHistoryPageData) =>
    renderTrendLinePane(pageData, 'asset');

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

    // Same shape as the trends: how many expenses, the mood most of them had
    // as a quiet pill, the day-by-day bars, then one plain row per mood.
    const moodTotal = pageData.totals.happy + pageData.totals.neutral + pageData.totals.sad;
    const moods = [
      {
        key: 'happy' as const,
        label: String(I18n.t('review.mood_happy')),
        count: pageData.totals.happy,
        color: SENTIMENT_COLORS.happy,
      },
      {
        key: 'neutral' as const,
        label: String(I18n.t('review.mood_neutral')),
        count: pageData.totals.neutral,
        color: SENTIMENT_COLORS.neutral,
      },
      {
        key: 'sad' as const,
        label: String(I18n.t('review.mood_regret')),
        count: pageData.totals.sad,
        color: SENTIMENT_COLORS.sad,
      },
    ];
    const dominantMood = moods.reduce((best, mood) => (mood.count > best.count ? mood : best));
    const shareOf = (count: number) => (moodTotal > 0 ? count / moodTotal : 0);
    // One line per mood across the days (or months) of the period.
    const sentimentModel = getSentimentChartModel(pageData);
    const sentimentPeriodKey = pageData.range.start;
    const sentimentSelectedKey =
      sentimentModel.buckets.find(
        (bucket) => bucket.key === sentimentScrubBucketByPeriod[sentimentPeriodKey],
      )?.key ?? defaultTrendBucketKey(sentimentModel, false);
    return (
      <InsightPaneSplit
        className="mt-1 gap-3"
        primary={
          <>
            <TrendHeadline
              value={
                <Text
                  variant="heading"
                  className="text-[28px] leading-[36px] font-black tracking-tight"
                >
                  {String(
                    I18n.t(
                      moodTotal === 1
                        ? 'insights.analytics.expense_sentiment.count_one'
                        : 'insights.analytics.expense_sentiment.count_other',
                      { count: moodTotal },
                    ),
                  )}
                </Text>
              }
              badge={
                moodTotal > 0
                  ? {
                      text: `${dominantMood.label} · ${Math.round(
                        shareOf(dominantMood.count) * 100,
                      )}%`,
                      color: dominantMood.color,
                      direction: null,
                    }
                  : null
              }
            />
            <View
              style={lineChartSectionStyle}
              onTouchStart={lockChartScrub}
              onTouchEnd={unlockChartScrub}
              onTouchCancel={unlockChartScrub}
            >
              <TrendLineChart
                buckets={sentimentModel.buckets}
                series={sentimentModel.series}
                width={lineChartWidth}
                height={SENTIMENT_CHART_HEIGHT}
                selectedKey={sentimentSelectedKey}
                onSelectKey={(key) => {
                  setSentimentScrubBucketByPeriod((previous) =>
                    previous[sentimentPeriodKey] === key
                      ? previous
                      : { ...previous, [sentimentPeriodKey]: key },
                  );
                }}
                onGestureStart={lockChartScrub}
                onGestureEnd={unlockChartScrub}
                formatValue={formatCountValue}
                formatAxisValue={formatCountValue}
                zeroBased
                minTickStep={1}
                gridColor={withColorAlpha(themeColors.border, isDark ? 0.7 : 0.9)}
                labelColor={themeColors.textMuted}
                surfaceColor={themeColors.background}
                tooltipBackground={themeColors.card}
                tooltipTextColor={themeColors.text}
                accessibilityLabel={String(I18n.t('insights.expense_sentiment'))}
              />
            </View>
          </>
        }
        secondary={
          <View className="gap-1.5">
            <Text variant="bodyStrong">{I18n.t('review.mood')}</Text>
            {moods.map((mood) => (
              <View
                key={mood.key}
                className="flex-row items-center gap-3 rounded-2xl border border-border/40 bg-card px-3.5 py-2.5"
              >
                <SentimentIcon sentiment={mood.key} size={26} />
                <View className="flex-1 gap-1">
                  <Text variant="caption" numberOfLines={1}>
                    {mood.label}
                  </Text>
                  <View
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: withColorAlpha(themeColors.border, 0.55) }}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        buildWidthStyle(`${Math.round(shareOf(mood.count) * 100)}%`),
                        { backgroundColor: mood.color },
                      ]}
                    />
                  </View>
                </View>
                <View className="items-end">
                  <Text variant="bodyStrong">{mood.count}</Text>
                  <Text variant="caption" tone="muted" style={styles.secondaryDetail}>
                    {`${Math.round(shareOf(mood.count) * 100)}%`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        }
      />
    );
  };

  const renderAnalyticsPane = (pageData: AnalyticsPageData) => {
    if (pageData.insightType === 'savings_rate') {
      // Same shape as the trends: the year's rate as the headline with a quiet
      // pill, the month-by-month rate as a line, then one plain row per month.
      const savingsRate =
        pageData.totalIncome > 0 ? pageData.totalNet / pageData.totalIncome : null;
      const displayRatePercent =
        savingsRate === null ? null : Number((savingsRate * 100).toFixed(1));
      const toneColor = savingsRateColor(displayRatePercent, themeColors);
      const yearKey = pageData.range.start.slice(0, 4);
      const chartModel = getSavingsChartModel(pageData);
      // A year with nothing in it yet (one ahead of today) has nothing to chart.
      if (
        pageData.totalIncome === 0 &&
        pageData.totalExpense === 0 &&
        chartModel.values.every((value) => value === null)
      ) {
        return (
          <EmptyState
            title={I18n.t('insights.empty.title')}
            message={I18n.t('insights.empty.message')}
            mascotMood="curious"
            animateIn={false}
          />
        );
      }
      const selectedKey =
        chartModel.buckets.find((bucket) => bucket.key === savingsScrubMonthByYear[yearKey])?.key ??
        defaultTrendBucketKey(chartModel, false);
      const savedText =
        settings.displayMode === 'time'
          ? formatHours(Math.abs(pageData.totalNet), settings)
          : formatCompactCurrency(Math.abs(pageData.totalNet), settings.currencySymbol);
      const badge: TrendHeadlineBadge | null =
        savingsRate === null || pageData.totalNet === 0
          ? null
          : {
              text: String(
                I18n.t(
                  pageData.totalNet > 0
                    ? 'insights.analytics.savings_rate.saved'
                    : 'insights.analytics.savings_rate.overspent',
                  { value: savedText },
                ),
              ),
              color: pageData.totalNet > 0 ? themeColors.success : themeColors.error,
              direction: null,
            };
      const compact = (value: number) =>
        settings.displayMode === 'time'
          ? formatHoursCompact(value, settings)
          : formatCompactCurrency(value, settings.currencySymbol);
      const emptyTileColor = withColorAlpha(themeColors.textMuted, isDark ? 0.16 : 0.1);
      // The month with the best rate gets a small star, once there are at
      // least two months that saved something to compare.
      const ratedRows = pageData.savingsRateRows.filter((row) => (row.savingsRate ?? 0) > 0);
      const bestSavingsMonthKey =
        ratedRows.length < 2
          ? null
          : ratedRows.reduce((best, row) =>
              (row.savingsRate ?? 0) > (best.savingsRate ?? 0) ? row : best,
            ).monthKey;

      return (
        <InsightPaneSplit
          className="mt-1 gap-3"
          primary={
            <>
              <TrendHeadline
                value={
                  <Text
                    variant="heading"
                    className="text-[30px] leading-[38px] font-black tracking-tight"
                    style={{ color: savingsRate === null ? themeColors.textMuted : toneColor }}
                  >
                    {displayRatePercent === null
                      ? I18n.t('insights.analytics.savings_rate.no_income_short')
                      : formatSavingsRatePercentLabel(displayRatePercent)}
                  </Text>
                }
                badge={badge}
              />
              <View
                style={lineChartSectionStyle}
                onTouchStart={lockChartScrub}
                onTouchEnd={unlockChartScrub}
                onTouchCancel={unlockChartScrub}
              >
                <TrendLineChart
                  buckets={chartModel.buckets}
                  series={chartModel.series}
                  width={lineChartWidth}
                  height={TREND_CHART_HEIGHT - 20}
                  selectedKey={selectedKey}
                  onSelectKey={(key) => {
                    setSavingsScrubMonthByYear((previous) =>
                      previous[yearKey] === key ? previous : { ...previous, [yearKey]: key },
                    );
                  }}
                  onGestureStart={lockChartScrub}
                  onGestureEnd={unlockChartScrub}
                  formatValue={formatPercentValue}
                  formatAxisValue={formatPercentAxisValue}
                  zeroBased
                  minTickStep={1}
                  gridColor={withColorAlpha(themeColors.border, isDark ? 0.7 : 0.9)}
                  labelColor={themeColors.textMuted}
                  surfaceColor={themeColors.background}
                  tooltipBackground={themeColors.card}
                  tooltipTextColor={themeColors.text}
                  accessibilityLabel={String(I18n.t('insights.savings_rate'))}
                />
              </View>
            </>
          }
          secondary={
            <View className="gap-1.5">
              {pageData.savingsRateRows.map((row) => {
                const hasActivity =
                  row.transactions.length > 0 || row.income !== 0 || row.expense !== 0;
                if (!hasActivity) {
                  return (
                    <View
                      key={row.monthKey}
                      className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border/50 px-3 py-2.5 opacity-70"
                    >
                      <View
                        className="items-center justify-center rounded-xl"
                        style={[styles.savingsMonthTile, { backgroundColor: emptyTileColor }]}
                      >
                        <Text
                          variant="caption"
                          tone="muted"
                          numberOfLines={1}
                          className="self-stretch text-center"
                        >
                          {row.label}
                        </Text>
                      </View>
                      <Text variant="caption" tone="muted" className="flex-1">
                        —
                      </Text>
                    </View>
                  );
                }
                const monthlyPercent =
                  row.savingsRate === null ? null : Number((row.savingsRate * 100).toFixed(1));
                const monthlyTone = savingsRateColor(monthlyPercent, themeColors);
                const isBestMonth = row.monthKey === bestSavingsMonthKey;
                const rowSavedText = String(
                  I18n.t(
                    row.net >= 0
                      ? 'insights.analytics.savings_rate.saved'
                      : 'insights.analytics.savings_rate.overspent',
                    { value: compact(Math.abs(row.net)) },
                  ),
                );
                const rowIncomeText =
                  row.income > 0
                    ? String(
                        I18n.t('insights.analytics.savings_rate.of_income', {
                          value: compact(row.income),
                        }),
                      )
                    : String(I18n.t('insights.analytics.savings_rate.no_income_short'));
                const rowRateText =
                  monthlyPercent === null ? null : formatSavingsRatePercentLabel(monthlyPercent);
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
                    accessibilityLabel={[row.label, rowSavedText, rowIncomeText, rowRateText]
                      .filter(Boolean)
                      .join(', ')}
                    className="flex-row items-center gap-3 rounded-2xl border border-border/40 bg-card px-3 py-2.5 active:opacity-85"
                  >
                    <View>
                      <View
                        className="items-center justify-center rounded-xl"
                        style={[
                          styles.savingsMonthTile,
                          { backgroundColor: withColorAlpha(monthlyTone, isDark ? 0.22 : 0.12) },
                        ]}
                      >
                        {/* Stretched, not hugging: see the README's long-range pager trap. */}
                        <Text
                          variant="caption"
                          numberOfLines={1}
                          className="self-stretch text-center"
                        >
                          {row.label}
                        </Text>
                      </View>
                      {isBestMonth ? (
                        <View
                          className="absolute items-center justify-center rounded-full"
                          style={[styles.savingsBestBadge, { backgroundColor: themeColors.card }]}
                        >
                          <Star size={11} color={themeColors.accent} fill={themeColors.accent} />
                        </View>
                      ) : null}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {rowSavedText}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {rowIncomeText}
                      </Text>
                    </View>
                    {row.savingsRate === null || rowRateText === null ? (
                      <Text variant="bodyStrong" tone="muted">
                        —
                      </Text>
                    ) : (
                      <View className="shrink-0 flex-row items-center gap-2">
                        {/* The arc draws the month's rate, so replay masks it. */}
                        <View {...REPLAY_PRIVATE}>
                          <SavingsRateRing
                            size={24}
                            strokeWidth={3.5}
                            // An overspent month shows an empty track, not a filled arc.
                            progress={Math.max(0, row.savingsRate)}
                            color={monthlyTone}
                            trackColor={withColorAlpha(monthlyTone, isDark ? 0.28 : 0.18)}
                          />
                        </View>
                        <View
                          className="items-center rounded-full px-2.5 py-1"
                          style={[
                            styles.savingsRatePill,
                            { backgroundColor: withColorAlpha(monthlyTone, isDark ? 0.22 : 0.12) },
                          ]}
                        >
                          <Text variant="caption" style={{ color: monthlyTone }}>
                            {rowRateText}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          }
        />
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
  // Inline bulk-edit selection for the trend transaction lists
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showDuplicatePicker, setShowDuplicatePicker] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);

  const isSelectionMode = selectedTransactionIds.length > 0;
  // The chips are hidden while selecting, so an armed "Compare" is dropped.
  useEffect(() => {
    if (isSelectionMode) setIsPickingCategoryCompare(false);
  }, [isSelectionMode]);
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
      ? formatHours(Math.abs(selectedTransactionTotal), settings)
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
    setShowDuplicatePicker(false);
  }, []);
  const duplicableSelectedTransactions = useMemo(() => {
    const duplicable: TransactionWithRelations[] = [];
    selectedTransactionIds.forEach((id) => {
      const transaction = transactionById.get(id);
      if (transaction && canDuplicateTransaction(transaction)) duplicable.push(transaction);
    });
    return duplicable;
  }, [selectedTransactionIds, transactionById]);
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
  const handleOpenDuplicatePicker = useCallback(() => {
    if (duplicableSelectedTransactions.length === 0) return;
    setShowDuplicatePicker(true);
  }, [duplicableSelectedTransactions.length]);
  const handleDuplicated = useCallback(() => {
    setSelectedTransactionIds([]);
  }, []);
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
        // Line colours follow the theme colour, and which buckets count as
        // future or still under way moves on at midnight.
        themeColors.primary,
        currentTrendDayKey,
        // Selection state must invalidate the memoized pages so the trend lists
        // re-render with the current selection highlight.
        isSelectionMode ? 'sel' : 'nosel',
        selectedTransactionIds.join(','),
        serializeRecordForSignature(expenseTrendScrubMonthByYear),
        serializeRecordForSignature(incomeTrendScrubMonthByYear),
        serializeRecordForSignature(assetHistoryScrubMonthByYear),
        serializeRecordForSignature(savingsScrubMonthByYear),
        serializeRecordForSignature(sentimentScrubBucketByPeriod),
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
      savingsScrubMonthByYear,
      sentimentScrubBucketByPeriod,
      categoryTrendScrubBucketByPeriod,
      expenseTrendScrubMonthByYear,
      isPro,
      incomeTrendScrubMonthByYear,
      isDark,
      isSelectionMode,
      currentTrendDayKey,
      themeColors.primary,
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
  // scrolling near the bottom can grow its visible window (infinite scroll). Read
  // through a ref so the scroll handler stays stable while it sees this render's
  // selection and chart data.
  const resolveTrendListContextRef = useRef<
    (pageData: InsightPageData) => { key: string; total: number } | null
  >(() => null);
  resolveTrendListContextRef.current = (pageData) => {
    const kind: TrendKind | null =
      pageData.kind === 'expense_trend'
        ? 'expense'
        : pageData.kind === 'income_trend'
          ? 'income'
          : pageData.kind === 'category_trend'
            ? 'category'
            : null;
    if (!kind || !('periodKey' in pageData)) return null;
    const model = getTrendChartModel(pageData);
    if (!model) return null;
    const selectedKey =
      model.buckets.find((bucket) => bucket.key === trendScrubSelection(kind, pageData.periodKey))
        ?.key ?? defaultTrendBucketKey(model, true);
    if (!selectedKey) return null;
    return {
      key: `${kind}|${pageData.periodKey}|${selectedKey}`,
      total: model.transactionsByKey.get(selectedKey)?.length ?? 0,
    };
  };
  const resolveTrendListContext = useCallback(
    (pageData: InsightPageData) => resolveTrendListContextRef.current(pageData),
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
          paneRenderVersion={paneRenderVersion}
          getPageScrollRef={getPageScrollRef}
          renderInsightsPane={renderInsightsPaneStable}
          onScrollNearEnd={handlePaneScrollNearEnd}
          split={insightsSplit}
        />
      );
    },
    [
      insightsSplit,
      displayCommittedPageIndex,
      displayCurrentPeriodState,
      displayPeriodPreset,
      displaySelectedInsightType,
      getCachedPageData,
      getPageScrollRef,
      handlePaneScrollNearEnd,
      insightsPageStyle,
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
  // The savings lists had no prune, which was harmless while they only
  // excluded; a deleted category left as the only inclusion would hide every
  // row of that type.
  useEffect(() => {
    if (
      excludedSavingsIncomeCategoryIds.length === 0 &&
      excludedSavingsExpenseCategoryIds.length === 0
    ) {
      return;
    }
    const liveIds = (type: CategoryType) =>
      new Set(categories.filter((category) => category.type === type).map((c) => c.id));
    const keepLive = (previous: string[], live: Set<string>) => {
      const next = previous.filter((categoryId) => live.has(categoryId));
      return next.length === previous.length ? previous : next;
    };
    const liveIncome = liveIds('income');
    const liveExpense = liveIds('expense');
    setExcludedSavingsIncomeCategoryIds((previous) => keepLive(previous, liveIncome));
    setExcludedSavingsExpenseCategoryIds((previous) => keepLive(previous, liveExpense));
  }, [
    categories,
    excludedSavingsIncomeCategoryIds.length,
    excludedSavingsExpenseCategoryIds.length,
  ]);
  // One pass for all three review lists: an id whose account or category has
  // been deleted would otherwise sit in the header badge with nothing behind it.
  useEffect(() => {
    setReviewFilters((previous) => {
      if (reviewFilterCount(previous) === 0) return previous;
      return pruneReviewFilters(
        previous,
        new Set(accounts.map((account) => account.id)),
        new Set(
          categories
            .filter((category) => category.type === 'expense')
            .map((category) => category.id),
        ),
        new Set(
          categories
            .filter((category) => category.type === 'income')
            .map((category) => category.id),
        ),
      );
    });
    // `reviewFilters` is a dep so the pass re-runs once right after the saved
    // preferences hydrate; `pruneReviewFilters` returns the same object when
    // there is nothing to drop, so the setState bails and this cannot loop.
  }, [accounts, categories, reviewFilters]);
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
    // Accounts are empty until the first load; pruning then would wipe every
    // stored choice before the accounts they name arrive.
    if (isLoading) return;
    setAssetHistoryAccountOverrides((previous) =>
      pruneAssetHistoryOverrides(previous, assetHistoryAccountOptions),
    );
  }, [assetHistoryAccountOptions, assetHistoryAccountOverrides, isLoading]);
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
      count += Object.keys(assetHistoryAccountOverrides).length;
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
    assetHistoryAccountOverrides,
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
    setAnchorDate(
      resetPreset === 'week'
        ? startOfDayDate(now)
        : financialMonthAnchorForToday(monthCycleRef.current),
    );
    setCustomStart(formatDateInput(financialMonthAnchorForToday(monthCycleRef.current)));
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
    setCategoryTrendCompareCategoryId(null);
    setAssetHistoryAccountOverrides({});
    setAssetHistoryScrubMonthByYear({});
    setCategoryTrendScrubBucketByPeriod({});
    setSavingsScrubMonthByYear({});
    setSentimentScrubBucketByPeriod({});
    setIsPickingCategoryCompare(false);
    setInsightsFilterModes({});
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
        setAnchorDate(
          nextEffectivePreset === 'week'
            ? startOfDayDate(now)
            : financialMonthAnchorForToday(monthCycleRef.current),
        );
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
  // The sheet itself is mounted by the review page, which owns the period list.
  const openReviewFilters = useCallback(() => {
    setIsPeriodPickerOpen(false);
    reviewPagerRef.current?.openFilters();
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
      handleInsightTypeChange(
        isInsightGroupId(value) ? insightTypeForGroup(value, lastInsightTypeByGroup) : value,
      );
    },
    [handleInsightTypeChange, lastInsightTypeByGroup],
  );
  const handleInsightTabSelect = useCallback(
    (value: string) => {
      if (value === selectedInsightType) return;
      void triggerHaptic('selection');
      handleInsightTypeChange(value);
    },
    [handleInsightTypeChange, selectedInsightType],
  );
  useEffect(() => {
    if (!isPeriodPickerOpen) return;
    const frame = requestAnimationFrame(() => {
      measurePeriodPickerTrigger();
    });
    return () => cancelAnimationFrame(frame);
  }, [height, isPeriodPickerOpen, measurePeriodPickerTrigger, width]);
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
      <View style={[styles.flexOne, { paddingHorizontal: column.margin }]}>
        <ContentFrameProvider width={column.width} height={height}>
          <View
            // Above the pages: a Skia chart is not clipped by its scroll view, so
            // a scrolled chart would otherwise draw over the header.
            style={
              splitPanes ? [styles.splitHeader, { width: splitPanes.left }] : styles.stackedHeader
            }
            onLayout={splitPanes ? handleSplitHeaderLayout : undefined}
          >
            <MonthControlsHeader
              titleNode={
                <View className="flex-row items-center gap-2">
                  <View ref={insightsTypeSelectorRef}>
                    <Pressable
                      onPress={openInsightMenu}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('insights.insight_type')}
                      accessibilityValue={{
                        text: String(
                          I18n.t(`insights.${insightMenuEntryOf(displaySelectedInsightType)}`),
                        ),
                      }}
                      accessibilityState={{ expanded: isInsightMenuOpen }}
                      className="h-10 w-10 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10 shadow-soft active:scale-90"
                    >
                      {renderInsightTypeIcon(displaySelectedInsightType)}
                      <View className="absolute -bottom-1 -right-1 h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary shadow-sm">
                        <ChevronDown size={11} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    </Pressable>
                  </View>
                  {/* The title with its period right under it: one header, not a
                  title row plus a separate period bar. */}
                  <View className="flex-1 items-center px-1">
                    <Text
                      variant={width < 380 ? 'subheading' : 'headingSm'}
                      numberOfLines={1}
                      className="text-center tracking-tight"
                    >
                      {String(I18n.t(`insights.${insightMenuEntryOf(displaySelectedInsightType)}`))}
                    </Text>
                    {isReviewView ? null : (
                      <InsightPeriodSwitcher
                        label={isBudgetView ? budgetMonthLabel : activePeriodLabel}
                        onPrevious={
                          isBudgetView
                            ? () => budgetPagerRef.current?.scrollToRelative(-1)
                            : handlePrevMonth
                        }
                        onNext={
                          isBudgetView
                            ? () => budgetPagerRef.current?.scrollToRelative(1)
                            : handleNextMonth
                        }
                        onPressLabel={
                          isBudgetView
                            ? () => budgetPagerRef.current?.openMonthPicker()
                            : isTakeoverView || displayPeriodPreset === 'lifetime'
                              ? undefined
                              : handleOpenPeriodPicker
                        }
                        disableArrows={!isTakeoverView && displayPeriodPreset === 'lifetime'}
                        labelRef={periodPickerTriggerRef}
                        onLabelLayout={handlePeriodPickerTriggerLayout}
                      />
                    )}
                  </View>
                  {/* Every insight type puts a 40px control here, which is what keeps
                the title above centred between it and the type selector. */}
                  <View className="w-10 items-end justify-center">
                    {isReviewView ? (
                      <FilterIconButton
                        onPress={openReviewFilters}
                        count={reviewFilterCount(reviewFilters)}
                      />
                    ) : isBudgetView ? (
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
                        <ClayIcon name="ui/filter-sliders" size={24} flatSize={18} />
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
              subNavigation={
                displayInsightGroup ? (
                  <View className="gap-2">
                    <InsightSubTabs
                      options={insightGroupTabOptions}
                      selectedValue={displaySelectedInsightType}
                      onSelect={handleInsightTabSelect}
                      accessibilityLabel={String(I18n.t(`insights.${displayInsightGroup}`))}
                    />
                    {displaySelectedInsightType === 'category_trend' &&
                    isPro &&
                    !isSelectionMode ? (
                      <CategoryTrendChips
                        options={categoryTrendChipOptions}
                        primaryId={effectiveCategoryTrendCategoryId}
                        compareId={effectiveCategoryTrendCompareId}
                        primaryColor={CATEGORY_TREND_PRIMARY_COLOR}
                        compareColor={CATEGORY_TREND_COMPARE_COLOR}
                        isPickingCompare={isPickingCategoryCompare}
                        onSelect={handleCategoryChipSelect}
                        onToggleCompare={handleToggleCategoryCompare}
                        onRemoveCompare={handleRemoveCategoryCompare}
                      />
                    ) : null}
                  </View>
                ) : undefined
              }
              // The period sits under the title (InsightPeriodSwitcher), so the
              // header's own month capsule is not drawn.
              monthLabel={isBudgetView ? budgetMonthLabel : activePeriodLabel}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              hideNavigation
            />
          </View>

          <View className="flex-1 overflow-hidden bg-background">
            {isLoading ? (
              <View className="flex-1 items-center justify-center">
                <LoadingDots size="large" />
                <Text variant="friendly" tone="muted" className="mt-3">
                  {I18n.t('insights.loading')}
                </Text>
              </View>
            ) : isReviewView ? (
              <ReviewPagerView
                ref={reviewPagerRef}
                zoom={reviewZoom}
                onZoomChange={setReviewZoom}
                filters={reviewFilters}
                onFiltersChange={setReviewFilters}
                onOpenTransaction={onOpenTransaction}
              />
            ) : isBudgetView ? (
              <BudgetPagerView
                ref={budgetPagerRef}
                onOpenTemplateEditor={onOpenBudgetTemplateEditor}
                onOpenBudgetEditor={onOpenPeriodBudgetEditor}
                onCreateCustomBudget={onCreateCustomBudget}
                onOpenDrilldown={onOpenDrilldown}
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
                // FlatList defaults clipping to true on Android. Nested scrollable
                // pages can stay detached after a swipe, leaving the chart blank.
                // Disable it explicitly; windowSize still limits mounted pages.
                removeClippedSubviews={false}
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
                onDuplicate={
                  duplicableSelectedTransactions.length > 0 ? handleOpenDuplicatePicker : undefined
                }
                onEdit={handleOpenBulkUpdate}
                onDelete={handleDeleteSelectedTransactions}
              />
            ) : null}
          </View>

          <BulkEditTransactionsSheet
            visible={showBulkUpdate}
            selectedCount={selectedTransactionCount}
            categoryTypes={selectionCategoryTypes}
            onClose={handleCloseBulkUpdate}
            onApply={handleApplyBulkUpdate}
          />

          <DuplicateTransactionsDatePicker
            visible={showDuplicatePicker}
            transactions={duplicableSelectedTransactions}
            onClose={() => setShowDuplicatePicker(false)}
            onDuplicated={handleDuplicated}
          />

          <PeriodPickerPopover
            visible={isPeriodPickerOpen}
            anchorRect={periodPickerAnchorRect}
            screenWidth={width}
            screenHeight={height}
            locale={activeLocale}
            weekStartsOn={weekStartsOn}
            monthCycle={monthCycle}
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
            selectedValue={insightMenuEntryOf(displaySelectedInsightType)}
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
                      {(activeInsightFilterConfig.allowedPeriodPresets ?? PERIOD_TABS).map(
                        (tab) => (
                          <FilterPill
                            key={tab}
                            label={I18n.t(
                              tab === 'lifetime'
                                ? 'insights.period.all_time'
                                : `insights.period.${tab}`,
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
                                  monthCycle,
                                );
                                setAnchorDate(resolveWeekAnchorDateFromRange(currentRange));
                              }
                              setPeriodPreset(tab);
                              if (tab === 'custom') setActiveCustomDateField('start');
                            }}
                          />
                        ),
                      )}
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
                          onPress={() =>
                            setSelectedAccountIds((prev) => toggleStringId(prev, a.id))
                          }
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {hasAssetHistoryAccountExclusionFilter ? (
                  <SelectionFilterField
                    label={I18n.t('insights.filters.accounts')}
                    mode={filterModeOf(insightsFilterModes, 'assetHistoryAccounts')}
                    count={assetHistoryPickedAccountIds.length}
                    emptyLabel={I18n.t('common.none')}
                    onModeChange={(mode) => {
                      setInsightsFilterMode('assetHistoryAccounts', mode);
                      // Include counts the shown accounts and reads none as "All",
                      // so with every account hidden the row would claim "All" over
                      // an empty chart. Bring them back instead, which is what
                      // "All" promises.
                      if (
                        mode === 'include' &&
                        excludedAssetHistoryAccountIds.length === assetHistoryAccountOptions.length
                      ) {
                        setAssetHistoryAccountOverrides(
                          includeAllAssetHistoryAccounts(assetHistoryAccountOptions),
                        );
                      }
                    }}
                    onPress={() => setActiveInsightsFilterPicker('assetHistoryAccounts')}
                  />
                ) : null}

                {hasExpenseTrendExclusionFilter ? (
                  <View className="gap-3">
                    <SelectionFilterField
                      label={I18n.t('insights.filters.accounts')}
                      mode={filterModeOf(insightsFilterModes, 'expenseTrendAccounts')}
                      count={excludedExpenseTrendAccountIds.length}
                      emptyLabel={I18n.t('common.none')}
                      onModeChange={(mode) => setInsightsFilterMode('expenseTrendAccounts', mode)}
                      onPress={() => setActiveInsightsFilterPicker('expenseTrendAccounts')}
                    />
                    <SelectionFilterField
                      label={I18n.t('insights.filters.expense_categories')}
                      mode={filterModeOf(insightsFilterModes, 'expenseTrendExpenseCategories')}
                      count={excludedExpenseTrendExpenseCategoryIds.length}
                      emptyLabel={I18n.t('common.none')}
                      onModeChange={(mode) =>
                        setInsightsFilterMode('expenseTrendExpenseCategories', mode)
                      }
                      onPress={() => setActiveInsightsFilterPicker('expenseTrendExpenseCategories')}
                    />
                  </View>
                ) : null}

                {hasIncomeTrendExclusionFilter ? (
                  <View className="gap-3">
                    <SelectionFilterField
                      label={I18n.t('insights.filters.accounts')}
                      mode={filterModeOf(insightsFilterModes, 'incomeTrendAccounts')}
                      count={excludedIncomeTrendAccountIds.length}
                      emptyLabel={I18n.t('common.none')}
                      onModeChange={(mode) => setInsightsFilterMode('incomeTrendAccounts', mode)}
                      onPress={() => setActiveInsightsFilterPicker('incomeTrendAccounts')}
                    />
                    <SelectionFilterField
                      label={I18n.t('insights.filters.income_categories')}
                      mode={filterModeOf(insightsFilterModes, 'incomeTrendIncomeCategories')}
                      count={excludedIncomeTrendIncomeCategoryIds.length}
                      emptyLabel={I18n.t('common.none')}
                      onModeChange={(mode) =>
                        setInsightsFilterMode('incomeTrendIncomeCategories', mode)
                      }
                      onPress={() => setActiveInsightsFilterPicker('incomeTrendIncomeCategories')}
                    />
                  </View>
                ) : null}

                {hasCategoryTrendExclusionFilter ? (
                  <SelectionFilterField
                    label={I18n.t('insights.filters.accounts')}
                    mode={filterModeOf(insightsFilterModes, 'categoryTrendAccounts')}
                    count={excludedCategoryTrendAccountIds.length}
                    emptyLabel={I18n.t('common.none')}
                    onModeChange={(mode) => setInsightsFilterMode('categoryTrendAccounts', mode)}
                    onPress={() => setActiveInsightsFilterPicker('categoryTrendAccounts')}
                  />
                ) : null}

                {hasExpenseBreakdownExclusionFilter ? (
                  <SelectionFilterField
                    label={I18n.t('insights.filters.expense_categories')}
                    mode={filterModeOf(insightsFilterModes, 'expenseBreakdownCategories')}
                    count={excludedExpenseBreakdownCategoryIds.length}
                    emptyLabel={I18n.t('common.none')}
                    onModeChange={(mode) =>
                      setInsightsFilterMode('expenseBreakdownCategories', mode)
                    }
                    onPress={() => setActiveInsightsFilterPicker('expenseBreakdownCategories')}
                  />
                ) : null}

                {hasIncomeBreakdownExclusionFilter ? (
                  <SelectionFilterField
                    label={I18n.t('insights.filters.income_categories')}
                    mode={filterModeOf(insightsFilterModes, 'incomeBreakdownCategories')}
                    count={excludedIncomeBreakdownCategoryIds.length}
                    emptyLabel={I18n.t('common.none')}
                    onModeChange={(mode) =>
                      setInsightsFilterMode('incomeBreakdownCategories', mode)
                    }
                    onPress={() => setActiveInsightsFilterPicker('incomeBreakdownCategories')}
                  />
                ) : null}

                {hasSavingsCategoryExclusionFilter ? (
                  <View className="gap-3">
                    <SelectionFilterField
                      label={I18n.t('insights.filters.income_categories')}
                      mode={filterModeOf(insightsFilterModes, 'savingsIncomeCategories')}
                      count={excludedSavingsIncomeCategoryIds.length}
                      emptyLabel={I18n.t('common.none')}
                      onModeChange={(mode) =>
                        setInsightsFilterMode('savingsIncomeCategories', mode)
                      }
                      onPress={() => setActiveInsightsFilterPicker('savingsIncomeCategories')}
                    />
                    <SelectionFilterField
                      label={I18n.t('insights.filters.expense_categories')}
                      mode={filterModeOf(insightsFilterModes, 'savingsExpenseCategories')}
                      count={excludedSavingsExpenseCategoryIds.length}
                      emptyLabel={I18n.t('common.none')}
                      onModeChange={(mode) =>
                        setInsightsFilterMode('savingsExpenseCategories', mode)
                      }
                      onPress={() => setActiveInsightsFilterPicker('savingsExpenseCategories')}
                    />
                  </View>
                ) : null}
              </ScrollView>
              <AccountPickerSheet
                overlay
                visible={activeInsightsFilterPicker === 'assetHistoryAccounts'}
                onClose={closeInsightsFilterPicker}
                accounts={assetHistoryAccountOptions}
                accountGroups={accountGroups}
                selectedIds={assetHistoryPickedAccountIds}
                onToggleSelect={(accountId) => {
                  const account = assetHistoryAccountOptions.find((item) => item.id === accountId);
                  if (!account) return;
                  setAssetHistoryAccountOverrides((previous) => {
                    if (assetHistoryIncludeMode && assetHistoryPickedAccountIds.length === 0) {
                      return showOnlyAssetHistoryAccount(assetHistoryAccountOptions, account.id);
                    }
                    const next = toggleAssetHistoryAccount(previous, account);
                    // In include mode an empty pick means "all", so unticking the
                    // last shown account brings every account back rather than
                    // leaving a chart with nothing on it.
                    return assetHistoryIncludeMode &&
                      assetHistoryExcludedAccountIds(assetHistoryAccountOptions, next).length ===
                        assetHistoryAccountOptions.length
                      ? includeAllAssetHistoryAccounts(assetHistoryAccountOptions)
                      : next;
                  });
                }}
                onClear={() =>
                  setAssetHistoryAccountOverrides(
                    includeAllAssetHistoryAccounts(assetHistoryAccountOptions),
                  )
                }
              />
              <AccountPickerSheet
                overlay
                visible={activeInsightsFilterPicker === 'expenseTrendAccounts'}
                onClose={closeInsightsFilterPicker}
                accounts={accounts}
                accountGroups={accountGroups}
                selectedIds={excludedExpenseTrendAccountIds}
                onToggleSelect={(accountId) =>
                  setExcludedExpenseTrendAccountIds((previous) =>
                    toggleStringId(previous, accountId),
                  )
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
                  setExcludedIncomeTrendAccountIds((previous) =>
                    toggleStringId(previous, accountId),
                  )
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
                  setExcludedCategoryTrendAccountIds((previous) =>
                    toggleStringId(previous, accountId),
                  )
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
        </ContentFrameProvider>
      </View>
    </SafeAreaView>
  );
}
