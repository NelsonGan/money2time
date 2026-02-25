import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, PieChart } from 'react-native-chart-kit';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { ActivityTransactionList } from '~/features/transactions/components';
import { AccountPanel, CategoryPanel, DatePanel } from '~/features/transactions/components/editor';
import { RankedImpactChart, type RankedImpactRow } from '~/features/insights/components';
import { SelectField } from '~/components/ui/select';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import { FilterIconButton } from '~/components/navigation/FilterIconButton';
import { EmptyState } from '~/components/feedback/EmptyState';
import { Text } from '~/components/ui/text';
import { EditTransactionScreen } from '~/features/transactions/screens';
import { useApp } from '~/context/AppContext';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
  formatDateInput,
  formatHours,
  monthKeyFromIsoLocal,
  toRange,
} from '~/utils/formatters';
import { cn } from '~/utils';
import { useThemeColors } from '~/hooks/useThemeColors';
import { usePersistedJsonSnapshot } from '~/hooks/usePersistedJsonSnapshot';
import { useResolvedTheme } from '~/context/ThemeContext';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { I18n } from '~/lib/i18n';

const PERIOD_TABS = ['week', 'month', 'year', 'custom'] as const;
type PeriodPreset = (typeof PERIOD_TABS)[number];
const INSIGHT_TYPES = [
  'expense_breakdown',
  'income_breakdown',
  'calendar_view',
  'time_cost_leaderboard',
  'savings_rate',
  'asset_history',
] as const;
type InsightType = (typeof INSIGHT_TYPES)[number];
type BreakdownInsightType = Extract<InsightType, 'expense_breakdown' | 'income_breakdown'>;
type AnalyticsInsightType = Extract<InsightType, 'savings_rate'>;
type BreakdownTransactionType = 'expense' | 'income';
type TimeCostViewMode = 'category' | 'transaction';

const INSIGHT_ICONS: Record<InsightType, string> = {
  expense_breakdown: '📉',
  income_breakdown: '📈',
  calendar_view: '🗓️',
  time_cost_leaderboard: '⏱️',
  savings_rate: '💹',
  asset_history: '🏦',
};

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

const INSIGHTS_PAGER_TOTAL_SLOTS = 4801;
const INSIGHTS_PAGER_CENTER_INDEX = Math.floor(INSIGHTS_PAGER_TOTAL_SLOTS / 2);
const INSIGHTS_LIST_STYLE = { flex: 1 } as const;
const INSIGHTS_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: 18,
  paddingBottom: 110,
  paddingTop: 4,
} as const;
const DRILLDOWN_BULK_SCROLL_CONTENT_STYLE = { padding: 20, paddingBottom: 34, gap: 14 } as const;
const ASSET_HISTORY_CHART_HEIGHT = 226;
const ASSET_HISTORY_CHART_PADDING_TOP = 16;
const ASSET_HISTORY_CHART_PADDING_RIGHT = 88;
const ASSET_HISTORY_VERTICAL_HEIGHT_PERCENTAGE = 0.75;

type InsightFilterConfig = {
  fixedPeriodPreset: PeriodPreset | null;
  allowAccountFilter: boolean;
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
  asset_history: {
    fixedPeriodPreset: 'year',
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
  tone: 'income' | 'expense' | 'neutral';
  intensity: number;
};

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

type AssetHistoryMonthRow = {
  monthKey: string;
  label: string;
  totalAssets: number;
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
  excludedAccountsCount: number;
};

type InsightPageData =
  | BreakdownPageData
  | CalendarPageData
  | TimeCostPageData
  | AnalyticsPageData
  | AssetHistoryPageData;
type PeriodState = { anchorDate: Date; customStart: string; customEnd: string };
type DrilldownTransactionFilter = 'income' | 'expense';
const DRILLDOWN_TYPE_PAGES: readonly DrilldownTransactionFilter[] = ['income', 'expense'];

type InsightsPreferencesSnapshot = {
  version: 1;
  selectedInsightType: InsightType;
  periodPreset: PeriodPreset;
  anchorDate: string;
  customStart: string;
  customEnd: string;
  activeCustomDateField: 'start' | 'end';
  selectedAccountIds: string[];
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
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const next: Partial<InsightsPreferencesSnapshot> = {};
    if (
      typeof parsed.selectedInsightType === 'string' &&
      INSIGHT_TYPES.includes(parsed.selectedInsightType as InsightType)
    ) {
      next.selectedInsightType = parsed.selectedInsightType as InsightType;
    }
    if (
      typeof parsed.periodPreset === 'string' &&
      PERIOD_TABS.includes(parsed.periodPreset as PeriodPreset)
    ) {
      next.periodPreset = parsed.periodPreset as PeriodPreset;
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
    next.excludedSavingsIncomeCategoryIds = toUniqueStringList(
      parsed.excludedSavingsIncomeCategoryIds,
    );
    next.excludedSavingsExpenseCategoryIds = toUniqueStringList(
      parsed.excludedSavingsExpenseCategoryIds,
    );
    next.excludedAssetHistoryAccountIds = toUniqueStringList(
      parsed.excludedAssetHistoryAccountIds,
    );
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addPeriod(date: Date, preset: PeriodPreset, direction: 1 | -1) {
  const next = new Date(date);
  if (preset === 'week') next.setDate(next.getDate() + 7 * direction);
  if (preset === 'month') next.setMonth(next.getMonth() + direction);
  if (preset === 'year') next.setFullYear(next.getFullYear() + direction);
  if (preset === 'custom') next.setDate(next.getDate() + 30 * direction);
  return next;
}

function weekStart(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
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
    const start = weekStart(anchorDate);
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

function periodLabel(preset: PeriodPreset, range: { start: string; end: string }) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (preset === 'month')
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (preset === 'year') return start.toLocaleDateString('en-US', { year: 'numeric' });
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function rangeLengthDays(range: { start: string; end: string }) {
  return Math.max(
    1,
    Math.round(
      (new Date(range.end).getTime() - new Date(range.start).getTime()) / (1000 * 60 * 60 * 24),
    ) + 1,
  );
}

const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function monthLabelFromMonthKey(monthKey: string) {
  const monthStart = monthStartUtcDateFromMonthKey(monthKey);
  if (!monthStart) return monthKey;
  return monthStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
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

function formatCalendarDate(dayKey: string) {
  const dayDate = dayKeyToUtcDate(dayKey);
  if (!dayDate) return dayKey;
  return dayDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: dayDate.getUTCFullYear() !== new Date().getUTCFullYear() ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
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

function trimTrailingZeros(value: string) {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

function formatCompactAxisNumber(value: number) {
  const absValue = Math.abs(value);
  if (!Number.isFinite(absValue) || absValue === 0) return '0';

  const units = [
    { threshold: 1_000_000_000_000, suffix: 'T' },
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ] as const;

  for (const unit of units) {
    if (absValue < unit.threshold) continue;
    const scaled = absValue / unit.threshold;
    const decimalPlaces = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return `${trimTrailingZeros(scaled.toFixed(decimalPlaces))}${unit.suffix}`;
  }

  if (absValue >= 100) return Math.round(absValue).toString();
  if (absValue >= 10) return trimTrailingZeros(absValue.toFixed(1));
  if (absValue >= 1) return trimTrailingZeros(absValue.toFixed(2));

  const decimals = Math.max(0, 3 - Math.floor(Math.log10(absValue)) - 1);
  return trimTrailingZeros(absValue.toFixed(Math.min(6, decimals)));
}

function isLegacyBalanceAdjustmentTransfer(
  transaction: Pick<TransactionWithRelations, 'type' | 'accountId' | 'fromAccountId' | 'toAccountId'>,
) {
  return (
    transaction.type === 'transfer' &&
    !!transaction.accountId &&
    !transaction.fromAccountId &&
    !transaction.toAccountId
  );
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

function calcChartScaler(values: number[]) {
  return Math.max(...values) - Math.min(...values) || 1;
}

function calcChartBaseHeight(values: number[], height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min >= 0 && max >= 0) return height;
  if (min < 0 && max <= 0) return 0;
  return (height * max) / calcChartScaler(values);
}

function calcChartHeight(value: number, values: number[], height: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const scaler = calcChartScaler(values);
  if (min < 0 && max > 0) return height * (value / scaler);
  if (min >= 0 && max >= 0) return height * ((value - min) / scaler);
  return height * ((value - max) / scaler);
}

function assetHistoryPointX(index: number, width: number, pointCount: number) {
  const xMax = Math.max(1, pointCount);
  return ASSET_HISTORY_CHART_PADDING_RIGHT + (index * (width - ASSET_HISTORY_CHART_PADDING_RIGHT)) / xMax;
}

function assetHistoryNearestPointIndex(locationX: number, width: number, pointCount: number) {
  if (pointCount <= 1) return 0;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < pointCount; index += 1) {
    const distance = Math.abs(locationX - assetHistoryPointX(index, width, pointCount));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function assetHistoryPointY(value: number, values: number[]) {
  if (values.length === 0) return ASSET_HISTORY_CHART_PADDING_TOP;
  const baseHeight = calcChartBaseHeight(values, ASSET_HISTORY_CHART_HEIGHT);
  const valueHeight = calcChartHeight(value, values, ASSET_HISTORY_CHART_HEIGHT);
  return ((baseHeight - valueHeight) / 4) * 3 + ASSET_HISTORY_CHART_PADDING_TOP;
}

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

interface InsightsScreenProps {
  resetToCurrentMonthToken?: number;
}

export function InsightsScreen({
  resetToCurrentMonthToken = 0,
}: InsightsScreenProps = {}) {
  const {
    isLoading,
    settings,
    categories,
    accounts,
    accountGroups,
    queryTransactions,
    canUseTimeDisplayMode,
    getTrueHourlyRateForDate,
    getDisplayValueForTransaction,
    updateTransaction,
    deleteTransaction,
    insightsPreferencesJson,
    updateInsightsPreferencesJson,
  } = useApp();
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('month');
  const [anchorDate, setAnchorDate] = useState(() => startOfMonth(new Date()));
  const [customStart, setCustomStart] = useState(() =>
    formatDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [customEnd, setCustomEnd] = useState(() => formatDateInput(new Date()));
  const [activeCustomDateField, setActiveCustomDateField] = useState<'start' | 'end'>('start');
  const [selectedInsightType, setSelectedInsightType] = useState<InsightType>('expense_breakdown');
  const [activeBreakdownSliceId, setActiveBreakdownSliceId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
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
    [],
  );
  const [assetHistoryScrubMonthByYear, setAssetHistoryScrubMonthByYear] = useState<
    Record<string, string>
  >({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [drilldownState, setDrilldownState] = useState<{
    label: string;
    transactions: TransactionWithRelations[];
    showTypeFilter?: boolean;
  } | null>(null);
  const [drilldownTypeFilter, setDrilldownTypeFilter] =
    useState<DrilldownTransactionFilter>('expense');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(
    null,
  );
  const [selectedDrilldownTransactionIds, setSelectedDrilldownTransactionIds] = useState<string[]>(
    [],
  );
  const [showDrilldownBulkUpdate, setShowDrilldownBulkUpdate] = useState(false);
  const [drilldownBulkDate, setDrilldownBulkDate] = useState(() => formatDateInput(new Date()));
  const [drilldownBulkDateTouched, setDrilldownBulkDateTouched] = useState(false);
  const [drilldownBulkNote, setDrilldownBulkNote] = useState('');
  const [drilldownBulkNoteTouched, setDrilldownBulkNoteTouched] = useState(false);
  const [drilldownHeaderHeight, setDrilldownHeaderHeight] = useState(0);
  const [selectedCalendarDayKey, setSelectedCalendarDayKey] = useState<string | null>(null);
  const [timeCostViewMode, setTimeCostViewMode] = useState<TimeCostViewMode>('category');
  const calendarDetailAnimRef = useRef(new RNAnimated.Value(1));

  const { width } = useWindowDimensions();
  const pageWidth = Math.max(1, width);
  const insightsPageStyle = useMemo(() => ({ width: pageWidth }), [pageWidth]);
  const chartWidth = Math.max(260, width - 76);
  const pieSize = Math.min(240, chartWidth);
  const insightTypeOptions = useMemo(
    () =>
      INSIGHT_TYPES.map((type) => ({
        value: type,
        label: String(I18n.t(`insights.${type}`)),
        description: String(I18n.t(`insights.${type}_description`)),
        icon: INSIGHT_ICONS[type],
      })),
    [],
  );
  const horizontalListRef = useRef<FlatList<number> | null>(null);
  const drilldownPagerRef = useRef<FlatList<DrilldownTransactionFilter> | null>(null);
  const selectedInsightTypeRef = useRef<InsightType>(selectedInsightType);
  const periodPresetRef = useRef<PeriodPreset>(periodPreset);
  const [committedPageIndex, setCommittedPageIndex] = useState(INSIGHTS_PAGER_CENTER_INDEX);
  const committedPageIndexRef = useRef(INSIGHTS_PAGER_CENTER_INDEX);
  const [headerPreviewPageIndex, setHeaderPreviewPageIndex] = useState(INSIGHTS_PAGER_CENTER_INDEX);
  const headerPreviewPageIndexRef = useRef(INSIGHTS_PAGER_CENTER_INDEX);
  const activeBreakdownSliceIdRef = useRef<string | null>(null);
  const pieTouchStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pageScrollRefs = useRef(new Map<number, { current: ScrollView | null }>());
  const getPageScrollRef = useCallback((index: number) => {
    const existing = pageScrollRefs.current.get(index);
    if (existing) return existing;
    const next = { current: null as ScrollView | null };
    pageScrollRefs.current.set(index, next);
    return next;
  }, []);

  useEffect(() => {
    selectedInsightTypeRef.current = selectedInsightType;
  }, [selectedInsightType]);

  useEffect(() => {
    periodPresetRef.current = periodPreset;
  }, [periodPreset]);

  useEffect(() => {
    if (resetToCurrentMonthToken <= 0) return;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const currentInsightType = selectedInsightTypeRef.current;
    const currentPeriodPreset = periodPresetRef.current;
    const nextPeriodPreset =
      getInsightFilterConfig(currentInsightType).fixedPeriodPreset ?? currentPeriodPreset;

    if (nextPeriodPreset === 'custom') {
      setCustomStart(formatDateInput(monthStart));
      setCustomEnd(formatDateInput(monthEnd));
      setActiveCustomDateField('start');
    } else {
      setAnchorDate(startOfMonth(now));
    }
    setActiveBreakdownSliceId(null);
    setDrilldownState(null);
    setDrilldownTypeFilter('expense');
    setAssetHistoryScrubMonthByYear({});
    setSelectedTransaction(null);
    setSelectedDrilldownTransactionIds([]);
    setShowDrilldownBulkUpdate(false);
    setDrilldownBulkDate(formatDateInput(new Date()));
    setDrilldownBulkDateTouched(false);
    setDrilldownBulkNote('');
    setDrilldownBulkNoteTouched(false);
    setSelectedCalendarDayKey(null);
    setIsFilterModalOpen(false);
    committedPageIndexRef.current = INSIGHTS_PAGER_CENTER_INDEX;
    setCommittedPageIndex(INSIGHTS_PAGER_CENTER_INDEX);
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
      if (saved.periodPreset) setPeriodPreset(saved.periodPreset);
      if (saved.selectedInsightType) setSelectedInsightType(saved.selectedInsightType);
      if (saved.activeCustomDateField) setActiveCustomDateField(saved.activeCustomDateField);
      if (saved.timeCostViewMode) setTimeCostViewMode(saved.timeCostViewMode);
      if (saved.selectedAccountIds) setSelectedAccountIds(saved.selectedAccountIds);
      if (saved.excludedSavingsIncomeCategoryIds) {
        setExcludedSavingsIncomeCategoryIds(saved.excludedSavingsIncomeCategoryIds);
      }
      if (saved.excludedSavingsExpenseCategoryIds) {
        setExcludedSavingsExpenseCategoryIds(saved.excludedSavingsExpenseCategoryIds);
      }
      if (saved.excludedAssetHistoryAccountIds) {
        setExcludedAssetHistoryAccountIds(saved.excludedAssetHistoryAccountIds);
      }
      if (saved.excludedTimeCostExpenseCategoryId) {
        setExcludedTimeCostExpenseCategoryId(saved.excludedTimeCostExpenseCategoryId);
      }
      if (saved.anchorDate) {
        const parsedAnchorDate = parseDateInput(saved.anchorDate);
        if (parsedAnchorDate) {
          setAnchorDate(startOfMonth(parsedAnchorDate));
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
      periodPreset,
      anchorDate: formatDateInput(anchorDate),
      customStart,
      customEnd,
      activeCustomDateField,
      selectedAccountIds,
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
      excludedAssetHistoryAccountIds,
      excludedSavingsExpenseCategoryIds,
      excludedSavingsIncomeCategoryIds,
      excludedTimeCostExpenseCategoryId,
      periodPreset,
      selectedAccountIds,
      selectedInsightType,
      timeCostViewMode,
    ],
  );
  usePersistedJsonSnapshot<
    InsightsPreferencesSnapshot,
    Partial<InsightsPreferencesSnapshot>
  >({
    isLoading,
    storedJson: insightsPreferencesJson,
    snapshot: insightsPreferencesSnapshot,
    parseStoredJson: parseInsightsPreferencesPayload,
    applyParsedSnapshot: applyInsightsPreferencesSnapshot,
    writeStoredJson: updateInsightsPreferencesJson,
  });

  const allTransactions = useMemo(() => queryTransactions(), [queryTransactions]);
  const transactionById = useMemo(
    () => new Map(allTransactions.map((transaction) => [transaction.id, transaction])),
    [allTransactions],
  );
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
  const excludedSavingsIncomeCategorySet = useMemo(
    () => new Set(excludedSavingsIncomeCategoryIds),
    [excludedSavingsIncomeCategoryIds],
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
  const assetHistoryAccountOptions = useMemo(() => accounts, [accounts]);
  const includedAssetHistoryAccountIds = useMemo(
    () =>
      assetHistoryAccountOptions
        .filter((account) => !excludedAssetHistoryAccountSet.has(account.id))
        .map((account) => account.id),
    [assetHistoryAccountOptions, excludedAssetHistoryAccountSet],
  );
  const hasPeriodFilter = activeInsightFilterConfig.fixedPeriodPreset === null;
  const hasAccountFilter = activeInsightFilterConfig.allowAccountFilter;
  const hasSavingsCategoryExclusionFilter = selectedInsightType === 'savings_rate';
  const hasTimeCostExpenseCategoryExclusionFilter = selectedInsightType === 'time_cost_leaderboard';
  const hasAssetHistoryAccountExclusionFilter = selectedInsightType === 'asset_history';
  const hasInsightsFilters =
    hasPeriodFilter ||
    hasAccountFilter ||
    hasSavingsCategoryExclusionFilter ||
    hasTimeCostExpenseCategoryExclusionFilter ||
    hasAssetHistoryAccountExclusionFilter;

  const shiftPeriodState = useCallback(
    (state: PeriodState, direction: 1 | -1, preset: PeriodPreset): PeriodState => {
      if (preset === 'custom') {
        const start = parseDateInput(state.customStart);
        const end = parseDateInput(state.customEnd);
        if (!start || !end) return state;
        const days = rangeLengthDays(toRange(start, end));
        const nextStart = new Date(start);
        const nextEnd = new Date(end);
        nextStart.setDate(nextStart.getDate() + days * direction);
        nextEnd.setDate(nextEnd.getDate() + days * direction);
        return {
          anchorDate: state.anchorDate,
          customStart: formatDateInput(nextStart),
          customEnd: formatDateInput(nextEnd),
        };
      }
      return {
        anchorDate: addPeriod(state.anchorDate, preset, direction),
        customStart: state.customStart,
        customEnd: state.customEnd,
      };
    },
    [],
  );
  const shiftPeriodStateBySteps = useCallback(
    (state: PeriodState, steps: number, preset: PeriodPreset): PeriodState => {
      if (steps === 0) return state;
      let next = state;
      const direction: 1 | -1 = steps > 0 ? 1 : -1;
      const stepsCount = Math.abs(steps);
      for (let index = 0; index < stepsCount; index += 1) {
        next = shiftPeriodState(next, direction, preset);
      }
      return next;
    },
    [shiftPeriodState],
  );

  const buildPageData = useCallback(
    (state: PeriodState, insightType: InsightType): InsightPageData => {
      const range = getPeriodRange(
        effectivePeriodPreset,
        state.anchorDate,
        state.customStart,
        state.customEnd,
      );
      const inRangeTransactions = allTransactions.filter((tx) => {
        const time = new Date(tx.date).getTime();
        const inRange =
          time >= new Date(range.start).getTime() && time <= new Date(range.end).getTime();
        return (
          inRange &&
          tx.type !== 'transfer' &&
          (effectiveSelectedAccountIds.length === 0 ||
            (!!tx.accountId && effectiveSelectedAccountIds.includes(tx.accountId)))
        );
      });

      if (insightType === 'asset_history') {
        const includedAccounts = assetHistoryAccountOptions.filter(
          (account) => !excludedAssetHistoryAccountSet.has(account.id),
        );
        const excludedAccountsCount = assetHistoryAccountOptions.length - includedAccounts.length;
        const year = state.anchorDate.getFullYear();
        const monthRowsSeed: AssetHistoryMonthRow[] = Array.from({ length: 12 }, (_, monthIndex) => {
          const monthDate = new Date(Date.UTC(year, monthIndex, 1));
          return {
            monthKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
            label: monthDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
            totalAssets: 0,
          };
        });

        if (includedAccounts.length === 0) {
          return {
            kind: 'asset_history',
            year,
            range,
            filteredForRange: [],
            monthRows: monthRowsSeed,
            includedAccountsCount: 0,
            excludedAccountsCount,
          };
        }

        const accountById = new Map(includedAccounts.map((account) => [account.id, account]));
        const balancesByAccountId = new Map(
          includedAccounts.map((account) => [account.id, account.startingBalance]),
        );
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
          const monthKey = monthKeyFromIsoLocal(transaction.date);
          const isLegacyAdjustmentTransfer = isLegacyBalanceAdjustmentTransfer(transaction);

          if (transaction.type === 'income' && transaction.accountId) {
            const account = accountById.get(transaction.accountId);
            if (account) {
              addAccountDelta(
                monthKey,
                account.id,
                account.type === 'credit' ? -transaction.amount : transaction.amount,
              );
            }
          }

          if (transaction.type === 'expense' && transaction.accountId) {
            const account = accountById.get(transaction.accountId);
            if (account) {
              addAccountDelta(
                monthKey,
                account.id,
                account.type === 'credit' ? transaction.amount : -transaction.amount,
              );
            }
          }

          if (transaction.type === 'transfer' && !isLegacyAdjustmentTransfer && transaction.toAccountId) {
            const account = accountById.get(transaction.toAccountId);
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
            const account = accountById.get(transaction.fromAccountId);
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
            const account = accountById.get(transaction.accountId);
            if (account) {
              addAccountDelta(monthKey, account.id, transaction.amount);
            }
          }
        });

        const sortedDeltaMonthKeys = Array.from(monthlyDeltas.keys()).sort((a, b) =>
          a.localeCompare(b),
        );
        let deltaMonthIndex = 0;
        const monthRows = monthRowsSeed.map((seedRow) => {
          while (
            deltaMonthIndex < sortedDeltaMonthKeys.length &&
            (sortedDeltaMonthKeys[deltaMonthIndex] ?? '') <= seedRow.monthKey
          ) {
            const deltaMap = monthlyDeltas.get(sortedDeltaMonthKeys[deltaMonthIndex] ?? '');
            deltaMap?.forEach((delta, accountId) => {
              balancesByAccountId.set(
                accountId,
                (balancesByAccountId.get(accountId) ?? 0) + delta,
              );
            });
            deltaMonthIndex += 1;
          }

          const totalAssets = Array.from(balancesByAccountId.values()).reduce(
            (sum, value) => sum + value,
            0,
          );
          return { ...seedRow, totalAssets };
        });

        return {
          kind: 'asset_history',
          year,
          range,
          filteredForRange: [],
          monthRows,
          includedAccountsCount: includedAccounts.length,
          excludedAccountsCount,
        };
      }

      if (insightType === 'calendar_view') {
        const filteredForRange = inRangeTransactions.filter(
          (tx) => tx.type === 'income' || tx.type === 'expense',
        );
        const dailyTotalsByDayKey = new Map<string, CalendarDayAggregate>();
        let totalIncome = 0;
        let totalExpense = 0;

        filteredForRange.forEach((tx) => {
          const dayKey = dayKeyFromIsoLocal(tx.date);
          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          const current = dailyTotalsByDayKey.get(dayKey) ?? {
            dayKey,
            income: 0,
            expense: 0,
            net: 0,
            transactions: [],
          };
          if (tx.type === 'income') {
            current.income += value;
            totalIncome += value;
          } else {
            current.expense += value;
            totalExpense += value;
          }
          current.net = current.income - current.expense;
          current.transactions.push(tx);
          dailyTotalsByDayKey.set(dayKey, current);
        });

        dailyTotalsByDayKey.forEach((entry) => {
          entry.transactions.sort((a, b) => {
            const dateDelta = b.date.localeCompare(a.date);
            if (dateDelta !== 0) return dateDelta;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });

        const rangeStartDayKey = dayKeyFromIsoLocal(range.start);
        const rangeEndDayKey = dayKeyFromIsoLocal(range.end);
        const todayDayKey = dayKeyFromDateLocal(new Date());
        let maxDailyMagnitude = 0;
        dailyTotalsByDayKey.forEach((entry, dayKey) => {
          if (dayKey < rangeStartDayKey || dayKey > rangeEndDayKey) return;
          const magnitude = Math.max(entry.income, entry.expense, Math.abs(entry.net));
          if (magnitude > maxDailyMagnitude) maxDailyMagnitude = magnitude;
        });

        const monthSections: CalendarMonthSection[] = [];
        const firstMonthDate = monthStartUtcDateFromMonthKey(monthKeyFromDayKey(rangeStartDayKey));
        const endMonthKey = monthKeyFromDayKey(rangeEndDayKey);
        if (firstMonthDate) {
          const cursor = new Date(firstMonthDate);
          while (monthKeyFromUtcDate(cursor) <= endMonthKey) {
            const monthKey = monthKeyFromUtcDate(cursor);
            const monthLabel = monthLabelFromMonthKey(monthKey);
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
              const magnitude = Math.max(income, expense, Math.abs(net));
              const isOutsideRange = dayKey < rangeStartDayKey || dayKey > rangeEndDayKey;
              const isFuture = dayKey > todayDayKey;
              const tone =
                income === 0 && expense === 0
                  ? 'neutral'
                  : net > 0
                    ? 'income'
                    : net < 0
                      ? 'expense'
                      : 'neutral';

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
                tone,
                intensity: maxDailyMagnitude > 0 ? magnitude / maxDailyMagnitude : 0,
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

        const activeDayKeys = Array.from(dailyTotalsByDayKey.keys())
          .filter((dayKey) => dayKey >= rangeStartDayKey && dayKey <= rangeEndDayKey)
          .sort();
        const latestPastOrTodayActivityDay = [...activeDayKeys]
          .reverse()
          .find((dayKey) => dayKey <= todayDayKey);
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
          totalIncome,
          totalExpense,
          totalNet: totalIncome - totalExpense,
        };
      }

      if (insightType === 'time_cost_leaderboard') {
        const filteredForRange = inRangeTransactions.filter((tx) => {
          if (tx.type !== 'expense' || tx.amount <= 0) return false;
          if (excludedTimeCostExpenseCategorySet.size === 0) return true;
          if (!tx.categoryId) return true;
          const category = categoryById.get(tx.categoryId);
          const rootCategoryId = category?.parentId ?? tx.categoryId;
          return (
            !excludedTimeCostExpenseCategorySet.has(tx.categoryId) &&
            !excludedTimeCostExpenseCategorySet.has(rootCategoryId)
          );
        });
        const categoryTotals = new Map<string, TimeCostCategoryRow>();
        const transactionRows: TimeCostTransactionRow[] = [];
        let totalHours = 0;
        let totalAmount = 0;

        filteredForRange.forEach((tx) => {
          const trueHourlyRate = getTrueHourlyRateForDate(tx.date);
          if (trueHourlyRate <= 0) return;

          const hours = amountToHoursByRate(tx.amount, trueHourlyRate, settings.hourRounding);
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
            transactions: [...row.transactions].sort((a, b) => {
              const dateDelta = b.date.localeCompare(a.date);
              if (dateDelta !== 0) return dateDelta;
              return b.createdAt.localeCompare(a.createdAt);
            }),
            sharePct: totalHours > 0 ? (row.hours / totalHours) * 100 : 0,
          }))
          .slice(0, 8);

        const rankedTransactions = [...transactionRows]
          .sort((a, b) => b.hours - a.hours)
          .map((row) => ({
            ...row,
            sharePct: totalHours > 0 ? (row.hours / totalHours) * 100 : 0,
          }))
          .slice(0, 12);

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
        const filteredForRange = inRangeTransactions.filter(
          (tx) => tx.type === 'income' || tx.type === 'expense',
        );
        const transactionsForAnalytics =
          insightType === 'savings_rate'
            ? filteredForRange.filter((tx) => {
                const categoryId = tx.categoryId;
                if (!categoryId) return true;
                const category = categoryById.get(categoryId);
                const rootCategoryId = category?.parentId ?? categoryId;
                if (tx.type === 'income') {
                  return (
                    !excludedSavingsIncomeCategorySet.has(categoryId) &&
                    !excludedSavingsIncomeCategorySet.has(rootCategoryId)
                  );
                }
                if (tx.type === 'expense') {
                  return (
                    !excludedSavingsExpenseCategorySet.has(categoryId) &&
                    !excludedSavingsExpenseCategorySet.has(rootCategoryId)
                  );
                }
                return true;
              })
            : filteredForRange;
        const rangeStartDayKey = dayKeyFromIsoLocal(range.start);
        const rangeEndDayKey = dayKeyFromIsoLocal(range.end);
        const startDate = dayKeyToUtcDate(rangeStartDayKey);
        const endDate = dayKeyToUtcDate(rangeEndDayKey);
        const dailyRows: InsightAnalyticsDayRow[] = [];
        const dayByKey = new Map<string, InsightAnalyticsDayRow>();
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

        transactionsForAnalytics.forEach((tx) => {
          const dayKey = dayKeyFromIsoLocal(tx.date);
          const row = dayByKey.get(dayKey);
          if (!row) return;
          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          if (tx.type === 'income') {
            row.income += value;
            totalIncome += value;
          } else {
            row.expense += value;
            totalExpense += value;
          }
          row.net = row.income - row.expense;
          row.transactionCount += 1;
          row.transactions.push(tx);
        });

        dailyRows.forEach((row) => {
          row.transactions.sort((a, b) => {
            const dateDelta = b.date.localeCompare(a.date);
            if (dateDelta !== 0) return dateDelta;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });

        const savingsYear = new Date(range.start).getFullYear();
        const savingsRateRows: InsightAnalyticsSavingsRateMonthRow[] = Array.from(
          { length: 12 },
          (_, monthIndex) => {
            const monthDate = new Date(Date.UTC(savingsYear, monthIndex, 1));
            const monthLabel = monthDate.toLocaleDateString('en-US', {
              month: 'short',
              timeZone: 'UTC',
            });
            return {
              monthKey: `${savingsYear}-${String(monthIndex + 1).padStart(2, '0')}`,
              label: monthLabel,
              income: 0,
              expense: 0,
              net: 0,
              savingsRate: null,
              transactions: [],
            };
          },
        );
        const savingsRateRowByMonth = new Map(savingsRateRows.map((row) => [row.monthKey, row]));
        transactionsForAnalytics.forEach((tx) => {
          const monthKey = monthKeyFromIsoLocal(tx.date);
          const monthRow = savingsRateRowByMonth.get(monthKey);
          if (!monthRow) return;
          const value =
            settings.displayMode === 'time' ? getDisplayValueForTransaction(tx) : tx.amount;
          if (tx.type === 'income') {
            monthRow.income += value;
          } else {
            monthRow.expense += value;
          }
          monthRow.transactions.push(tx);
        });
        savingsRateRows.forEach((row) => {
          row.net = row.income - row.expense;
          row.savingsRate = row.income > 0 ? row.net / row.income : null;
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
      const filteredForRange = inRangeTransactions.filter((tx) => tx.type === transactionType);
      const breakdownTotals = new Map<
        string,
        { id: string; label: string; amount: number; count: number; emoji: string }
      >();
      const breakdownTransactionsById = new Map<string, TransactionWithRelations[]>();
      filteredForRange.forEach((tx) => {
        const category = tx.categoryId ? categoryById.get(tx.categoryId) : null;
        const root = category?.parentId ? categoryById.get(category.parentId) : category;
        const fallbackRootLabel = tx.categoryParentName ?? tx.categoryName ?? null;
        const fallbackRootKey = fallbackRootLabel
          ? `legacy-root:${fallbackRootLabel.toLowerCase()}`
          : null;
        const id = root?.id ?? fallbackRootKey ?? 'uncategorized';
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
      allTransactions,
      assetHistoryAccountOptions,
      canUseTimeDisplayMode,
      categoryById,
      effectivePeriodPreset,
      effectiveSelectedAccountIds,
      excludedAssetHistoryAccountSet,
      excludedSavingsExpenseCategorySet,
      excludedSavingsIncomeCategorySet,
      excludedTimeCostExpenseCategorySet,
      getTrueHourlyRateForDate,
      getDisplayValueForTransaction,
      settings.displayMode,
      settings.hourRounding,
    ],
  );
  const currentPeriodState = useMemo<PeriodState>(
    () => ({ anchorDate, customStart, customEnd }),
    [anchorDate, customEnd, customStart],
  );
  const currentPage = useMemo(
    () => buildPageData(currentPeriodState, selectedInsightType),
    [buildPageData, currentPeriodState, selectedInsightType],
  );
  const headerPreviewOffset = headerPreviewPageIndex - committedPageIndex;
  const headerPreviewPeriodState = useMemo(
    () => shiftPeriodStateBySteps(currentPeriodState, headerPreviewOffset, effectivePeriodPreset),
    [currentPeriodState, effectivePeriodPreset, headerPreviewOffset, shiftPeriodStateBySteps],
  );
  const headerPreviewRange = useMemo(
    () =>
      getPeriodRange(
        effectivePeriodPreset,
        headerPreviewPeriodState.anchorDate,
        headerPreviewPeriodState.customStart,
        headerPreviewPeriodState.customEnd,
      ),
    [effectivePeriodPreset, headerPreviewPeriodState],
  );
  const currentCalendarDefaultDayKey =
    currentPage.kind === 'calendar' ? currentPage.defaultSelectedDayKey : '';
  const activePeriodLabel = useMemo(
    () => periodLabel(effectivePeriodPreset, headerPreviewRange),
    [effectivePeriodPreset, headerPreviewRange],
  );

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const renderValue = useCallback(
    (value: number) =>
      settings.displayMode === 'time'
        ? formatHours(value)
        : formatAmount(value, settings, { showSign: false }),
    [settings],
  );
  const renderSignedValue = useCallback(
    (value: number) => {
      if (settings.displayMode === 'time') {
        const sign = value > 0 ? '+' : value < 0 ? '-' : '';
        return `${sign}${formatHours(Math.abs(value))}`;
      }
      return formatAmount(value, settings, { showSign: true });
    },
    [settings],
  );
  const renderMoneyAmount = useCallback(
    (amount: number) => formatAmount(amount, settings, { showSign: false, trueHourlyRate: 0 }),
    [settings],
  );
  const renderAssetAmount = useCallback(
    (amount: number) => formatAmount(amount, settings, { showSign: false, trueHourlyRate: 0 }),
    [settings],
  );
  const formatAssetAxisLabel = useCallback(
    (rawValue: string) => {
      const parsedValue = Number.parseFloat(rawValue.replace(/,/g, ''));
      if (!Number.isFinite(parsedValue)) return rawValue;
      const compactValue = formatCompactAxisNumber(parsedValue);
      const currencySymbol = settings.currencySymbol?.trim() ?? '';
      return currencySymbol ? `${currencySymbol}${compactValue}` : compactValue;
    },
    [settings.currencySymbol],
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
  const insightsPagerExtraData = useMemo(
    () => ({
      selectedInsightType,
      activeBreakdownSliceId,
      selectedCalendarDayKey,
      timeCostViewMode,
      assetHistoryScrubMonthByYear,
    }),
    [
      activeBreakdownSliceId,
      assetHistoryScrubMonthByYear,
      selectedCalendarDayKey,
      selectedInsightType,
      timeCostViewMode,
    ],
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
      setCommittedPageIndex(clampedIndex);
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
      if (!list) {
        commitInsightsPageByIndex(committedPageIndexRef.current + direction);
        return;
      }
      const targetIndex = clampInsightsPageIndex(committedPageIndexRef.current + direction);
      headerPreviewPageIndexRef.current = targetIndex;
      setHeaderPreviewPageIndex(targetIndex);
      list.scrollToIndex({
        index: targetIndex,
        animated: true,
      });
    },
    [clampInsightsPageIndex, commitInsightsPageByIndex, resetAdjacentPagesToTop],
  );

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

  const renderInsightsWindowPage = ({ item }: { item: number }) => {
    const pageOffset = item - committedPageIndex;
    const pagePeriodState = shiftPeriodStateBySteps(
      currentPeriodState,
      pageOffset,
      effectivePeriodPreset,
    );
    const pageData = buildPageData(pagePeriodState, selectedInsightType);

    return (
      <View style={insightsPageStyle} className="flex-1 bg-background">
        <ScrollView
          ref={(ref) => {
            getPageScrollRef(item).current = ref;
          }}
          className="flex-1"
          contentContainerStyle={INSIGHTS_SCROLL_CONTENT_STYLE}
        >
          {renderInsightsPane(pageData)}
        </ScrollView>
      </View>
    );
  };

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
    const normalizedRows = pageData.categoryRows.filter(
      (row) => Number.isFinite(row.amount) && row.amount > 0,
    );
    const pageTotalAmount = normalizedRows.reduce((sum, row) => sum + row.amount, 0);
    const pagePieData = normalizedRows.map((row, i) => ({
      id: row.id,
      name: row.label,
      amount: row.amount,
      emoji: row.emoji || categoryMap.get(row.id)?.icon || '•',
      pct: pageTotalAmount > 0 ? (row.amount / pageTotalAmount) * 100 : 0,
      color: INSIGHTS_CHART_COLORS[i % INSIGHTS_CHART_COLORS.length],
      legendFontColor: themeColors.textSoft,
      legendFontSize: 11,
    }));
    const activeSlice = pagePieData.find((item) => item.id === activeBreakdownSliceId) ?? null;
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
                <View
                  style={{ width: pieFrameSize, height: pieFrameSize }}
                  className="items-center justify-center"
                >
                  <View
                    style={{ width: pieSize, height: pieSize }}
                    className="items-center justify-center"
                  >
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
                      style={{ position: 'absolute', left: label.x + 16, top: label.y + 16 }}
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
              <View className="rounded-xl border border-border/30 bg-secondary/35 px-3 py-2 flex-row items-center justify-between">
                <Text variant="label" tone="muted">
                  {totalLabel}
                </Text>
                <Text variant="caption" className="text-foreground">
                  {renderValue(pageTotalAmount)}
                </Text>
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
                      void triggerHaptic('selection');
                      setActiveBreakdownSlice(null, false);
                      openDrilldown({
                        label: item.name,
                        transactions: pageData.breakdownTransactionsById.get(item.id) ?? [],
                      });
                    }}
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
                        <Text variant="label" className="text-foreground">
                          {renderValue(item.amount)}
                        </Text>
                        <View
                          className="rounded-full px-1.5 py-0.5"
                          style={{ backgroundColor: percentBadgeColor }}
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
    const selectedDayLabel = formatCalendarDate(selectedDayKey);
    const isFutureDay = selectedDayKey > todayDayKey;
    const dayCellGap = 6;
    const dayCellSize = Math.max(34, Math.floor((chartWidth - dayCellGap * 6 - 4) / 7));
    const dayDetailScale = calendarDetailAnimRef.current.interpolate({
      inputRange: [0.68, 1],
      outputRange: [0.985, 1],
    });

    return (
      <Card className="mt-2">
        <CardContent className="py-3 gap-2">
          <View className="gap-2.5">
            {pageData.monthSections.map((month) => (
              <View
                key={month.monthKey}
                className="rounded-2xl border border-border/35 bg-card/95 px-3 py-3"
              >
                <Text variant="caption" className="pb-2">
                  {month.label}
                </Text>

                <View className="flex-row mb-1.5">
                  {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
                    <View
                      key={`${month.monthKey}-${weekday}`}
                      style={{ width: dayCellSize }}
                      className="items-center"
                    >
                      <Text variant="label" tone="muted">
                        {weekday}
                      </Text>
                    </View>
                  ))}
                </View>

                <View className="flex-row flex-wrap" style={{ gap: dayCellGap }}>
                  {month.cells.map((cell) => {
                    if (cell.kind === 'spacer') {
                      return (
                        <View key={cell.id} style={{ width: dayCellSize, height: dayCellSize }} />
                      );
                    }

                    const isSelected = cell.dayKey === selectedDayKey;
                    const hasActivity = cell.transactionCount > 0;
                    const inactiveOpacity = cell.isOutsideRange ? 0.28 : 1;
                    const baseIntensity = Math.max(0, Math.min(1, cell.intensity));
                    const toneColor =
                      cell.tone === 'income'
                        ? themeColors.success
                        : cell.tone === 'expense'
                          ? themeColors.error
                          : themeColors.primary;
                    const bgColor = isSelected
                      ? withColorAlpha(themeColors.primary, 0.24)
                      : hasActivity
                        ? withColorAlpha(toneColor, 0.12 + baseIntensity * 0.45)
                        : cell.isFuture
                          ? withColorAlpha(themeColors.sky, 0.08)
                          : withColorAlpha(themeColors.surfaceMuted, 0.6);
                    const borderColor = isSelected
                      ? withColorAlpha(themeColors.primary, 0.9)
                      : hasActivity
                        ? withColorAlpha(toneColor, 0.22 + baseIntensity * 0.45)
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
                        className={cn(
                          'rounded-xl items-center justify-center border active:opacity-85',
                        )}
                        style={{
                          width: dayCellSize,
                          height: dayCellSize,
                          backgroundColor: bgColor,
                          borderColor,
                          borderWidth: isSelected ? 2 : 1,
                          opacity: inactiveOpacity,
                        }}
                      >
                        <Text
                          variant="caption"
                          className={cn(
                            isSelected
                              ? 'text-primary font-bold'
                              : cell.tone === 'income'
                                ? 'text-success'
                                : cell.tone === 'expense'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground',
                          )}
                        >
                          {cell.dayNumber}
                        </Text>
                        {hasActivity ? (
                          <View
                            className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor: isSelected ? themeColors.primary : toneColor,
                            }}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <RNAnimated.View
            style={{
              opacity: calendarDetailAnimRef.current,
              transform: [{ scale: dayDetailScale }],
            }}
          >
            <View className="rounded-2xl border border-border/35 bg-secondary/20 px-3.5 py-2.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text variant="caption">{selectedDayLabel}</Text>
                  <Text variant="label" tone="muted" className="mt-1">
                    {isFutureDay
                      ? I18n.t('insights.calendar.future_day')
                      : `${I18n.t('insights.calendar.transactions')}: ${selectedDayTransactions.length}`}
                  </Text>
                </View>
                {selectedDayTransactions.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      openDrilldown({
                        label: selectedDayLabel,
                        transactions: selectedDayTransactions,
                      });
                    }}
                    className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1.5 active:opacity-85"
                  >
                    <Text variant="label" className="text-primary">
                      {I18n.t('insights.calendar.view_all', {
                        count: selectedDayTransactions.length,
                      })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View className="mt-2 flex-row items-center gap-3">
                <View className="flex-1">
                  <Text variant="label" tone="muted">
                    {I18n.t('insights.calendar.income')}
                  </Text>
                  <Text variant="caption" className="text-success mt-0.5">
                    {renderValue(selectedDayData.income)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text variant="label" tone="muted">
                    {I18n.t('insights.calendar.expense')}
                  </Text>
                  <Text variant="caption" className="text-destructive mt-0.5">
                    {renderValue(selectedDayData.expense)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text variant="label" tone="muted">
                    {I18n.t('insights.calendar.net')}
                  </Text>
                  <Text
                    variant="caption"
                    className={cn(
                      'mt-0.5',
                      selectedDayData.net >= 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {renderSignedValue(selectedDayData.net)}
                  </Text>
                </View>
              </View>
            </View>
          </RNAnimated.View>
        </CardContent>
      </Card>
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

    const rows = timeCostViewMode === 'category' ? pageData.categoryRows : pageData.transactionRows;
    const viewSummaryLabel =
      timeCostViewMode === 'category'
        ? I18n.t('insights.time_cost.summary_top_categories')
        : I18n.t('insights.time_cost.summary_top_transactions');
    const impactRows: RankedImpactRow[] = rows.map((row, index) => {
      const accentColor = TIME_COST_RANK_ACCENTS[index % TIME_COST_RANK_ACCENTS.length];
      if (timeCostViewMode === 'category') {
        const categoryRow = row as TimeCostCategoryRow;
        return {
          id: categoryRow.id,
          rank: index + 1,
          title: categoryRow.label,
          subtitle: I18n.t('insights.time_cost.transaction_count', { count: categoryRow.count }),
          primaryValue: formatHours(categoryRow.hours),
          secondaryValue: renderMoneyAmount(categoryRow.amount),
          sharePct: categoryRow.sharePct,
          emoji: categoryRow.emoji,
          accentColor,
          onPress: () => {
            openDrilldown({
              label: `${categoryRow.emoji} ${categoryRow.label}`,
              transactions: categoryRow.transactions,
            });
          },
        };
      }

      const transactionRow = row as TimeCostTransactionRow;
      return {
        id: transactionRow.id,
        rank: index + 1,
        title: transactionRow.label,
        subtitle: transactionRow.subtitle,
        primaryValue: formatHours(transactionRow.hours),
        secondaryValue: renderMoneyAmount(transactionRow.amount),
        sharePct: transactionRow.sharePct,
        accentColor,
        onPress: () => {
          setSelectedTransaction(transactionRow.transaction);
        },
      };
    });

    return (
      <Card className="mt-2">
        <CardContent className="py-3 gap-2">
          <View className="rounded-2xl border border-border/35 bg-secondary/30 px-3.5 py-3">
            <View className="flex-row items-center justify-between">
              <Text variant="caption">{I18n.t('insights.time_cost.summary_title')}</Text>
              <Text variant="label" tone="muted">
                {viewSummaryLabel}
              </Text>
            </View>
            <View className="mt-2.5 flex-row items-center gap-2">
              <View className="flex-1 rounded-xl border border-primary/25 bg-primary/12 px-2.5 py-2">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.time_cost.total_hours')}
                </Text>
                <Text variant="caption" className="text-primary mt-1">
                  {formatHours(pageData.totalHours)}
                </Text>
              </View>
              <View className="flex-1 rounded-xl border border-border/30 bg-card/80 px-2.5 py-2">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.time_cost.money_equivalent')}
                </Text>
                <Text variant="caption" className="text-foreground mt-1">
                  {renderMoneyAmount(pageData.totalAmount)}
                </Text>
              </View>
            </View>
            <Text variant="label" tone="muted" className="mt-2">
              {I18n.t('insights.time_cost.summary_hint')}
            </Text>
          </View>

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
            shareLabel={I18n.t('insights.time_cost.share_label')}
          />
        </CardContent>
      </Card>
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

    const monthValues = pageData.monthRows.map((row) => row.totalAssets);
    const selectedMonthKey = assetHistoryScrubMonthByYear[String(pageData.year)] ?? null;
    const selectedMonthRow =
      pageData.monthRows.find((row) => row.monthKey === selectedMonthKey) ??
      pageData.monthRows[pageData.monthRows.length - 1] ??
      null;
    const selectedMonthIndex = selectedMonthRow
      ? pageData.monthRows.findIndex((row) => row.monthKey === selectedMonthRow.monthKey)
      : -1;
    const selectedMonthToneClass =
      selectedMonthRow && selectedMonthRow.totalAssets >= 0 ? 'text-success' : 'text-destructive';
    const selectedPointX =
      selectedMonthIndex >= 0
        ? assetHistoryPointX(selectedMonthIndex, chartWidth, pageData.monthRows.length)
        : null;
    const selectedPointY = selectedMonthRow
      ? assetHistoryPointY(selectedMonthRow.totalAssets, monthValues)
      : null;
    const selectedYearKey = String(pageData.year);
    const selectAssetHistoryMonth = (monthKey: string) => {
      if (assetHistoryScrubMonthByYear[selectedYearKey] === monthKey) return;
      void triggerHaptic('selection');
      setAssetHistoryScrubMonthByYear((previous) => {
        if (previous[selectedYearKey] === monthKey) return previous;
        return { ...previous, [selectedYearKey]: monthKey };
      });
    };
    const selectAssetHistoryMonthFromChartTap = (locationX: number) => {
      const monthIndex = assetHistoryNearestPointIndex(
        locationX,
        chartWidth,
        pageData.monthRows.length,
      );
      const monthKey = pageData.monthRows[monthIndex]?.monthKey;
      if (!monthKey) return;
      selectAssetHistoryMonth(monthKey);
    };

    const chartData = {
      labels: pageData.monthRows.map((row) => row.label),
      datasets: [
        {
          data: pageData.monthRows.map((row) => row.totalAssets),
          color: (opacity = 1) => {
            const r = isDark ? 52 : 31;
            const g = isDark ? 201 : 138;
            const b = isDark ? 154 : 111;
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
          },
          strokeWidth: 2,
        },
      ],
    };

    return (
      <Card className="mt-2">
        <CardContent className="py-3 gap-2.5">
          <View className="rounded-2xl border border-border/35 bg-secondary/30 px-3.5 py-3">
            <View className="flex-row items-center justify-between">
              <Text variant="caption">{I18n.t('insights.analytics.asset_history.summary_title')}</Text>
              <Text variant="label" tone="muted">
                {I18n.t('insights.analytics.asset_history.account_count', {
                  count: pageData.includedAccountsCount,
                })}
              </Text>
            </View>
            {pageData.excludedAccountsCount > 0 ? (
              <Text variant="label" tone="muted" className="mt-1">
                {I18n.t('insights.analytics.asset_history.unselected_count', {
                  count: pageData.excludedAccountsCount,
                })}
              </Text>
            ) : null}
            {selectedMonthRow ? (
              <View className="mt-2.5 rounded-xl border border-border/30 bg-card/80 px-2.5 py-2 flex-row items-center justify-between">
                <Text variant="label" tone="muted">
                  {I18n.t('insights.analytics.asset_history.selected')}: {selectedMonthRow.label}
                </Text>
                <Text variant="caption" className={cn(selectedMonthToneClass)}>
                  {renderAssetAmount(selectedMonthRow.totalAssets)}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="rounded-2xl border border-border/30 bg-card/90 px-2 py-2.5">
            <View style={{ width: chartWidth, height: ASSET_HISTORY_CHART_HEIGHT }} className="self-center">
              <LineChart
                data={chartData}
                width={chartWidth}
                height={ASSET_HISTORY_CHART_HEIGHT}
                chartConfig={chartConfig}
                formatYLabel={formatAssetAxisLabel}
                withDots
                withShadow={false}
                withInnerLines
                withOuterLines={false}
                withVerticalLines={false}
                bezier
                segments={4}
                style={{ borderRadius: 14, paddingRight: ASSET_HISTORY_CHART_PADDING_RIGHT }}
              />
              {selectedPointX !== null && selectedPointY !== null ? (
                <>
                  <View
                    className="absolute bg-primary/35"
                    pointerEvents="none"
                    style={{
                      left: selectedPointX - 0.5,
                      top: ASSET_HISTORY_CHART_PADDING_TOP,
                      width: 1,
                      height: ASSET_HISTORY_CHART_HEIGHT * ASSET_HISTORY_VERTICAL_HEIGHT_PERCENTAGE,
                    }}
                  />
                  <View
                    className="absolute h-3 w-3 rounded-full border-2 border-primary bg-background"
                    pointerEvents="none"
                    style={{ left: selectedPointX - 6, top: selectedPointY - 6 }}
                  />
                </>
              ) : null}
              <Pressable
                className="absolute inset-0"
                delayLongPress={10_000}
                onPress={(event) => {
                  selectAssetHistoryMonthFromChartTap(event.nativeEvent.locationX);
                }}
              />
            </View>
          </View>

          <View className="gap-1">
            {pageData.monthRows.map((row) => (
              <Pressable
                key={row.monthKey}
                onPress={() => {
                  selectAssetHistoryMonth(row.monthKey);
                }}
                className={cn(
                  'rounded-xl border px-3 py-2 flex-row items-center justify-between',
                  selectedMonthRow?.monthKey === row.monthKey
                    ? 'border-primary/45 bg-primary/10'
                    : 'border-border/25 bg-card/80',
                )}
              >
                <Text variant="caption">{row.label}</Text>
                <Text
                  variant="caption"
                  className={cn(row.totalAssets >= 0 ? 'text-success' : 'text-destructive')}
                >
                  {renderAssetAmount(row.totalAssets)}
                </Text>
              </Pressable>
            ))}
          </View>
        </CardContent>
      </Card>
    );
  };

  const renderAnalyticsPane = (pageData: AnalyticsPageData) => {
    if (pageData.insightType === 'savings_rate') {
      const savingsRate =
        pageData.totalIncome > 0 ? pageData.totalNet / pageData.totalIncome : null;
      const normalized = savingsRate === null ? 0 : Math.max(0, Math.min(1, Math.abs(savingsRate)));
      const totalCategoryExclusions =
        excludedSavingsIncomeCategoryIds.length + excludedSavingsExpenseCategoryIds.length;
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

      return (
        <Card className="mt-2">
          <CardContent className="py-3 gap-2.5">
            <View className="rounded-2xl border border-border/35 bg-secondary/30 px-3.5 py-3">
              <Text variant="caption">{I18n.t('insights.analytics.savings_rate.title')}</Text>
              <Text variant="heading" className={cn('mt-1', toneClass)}>
                {formattedSavingsRate}
              </Text>
              <View className="mt-2 h-3 rounded-full bg-secondary overflow-hidden">
                <View
                  className={cn('h-full rounded-full', rateBarClass)}
                  style={{ width: `${Math.round(normalized * 100)}%` }}
                />
              </View>
              <Text variant="label" tone="muted" className="mt-2">
                {savingsRate === null
                  ? I18n.t('insights.analytics.savings_rate.no_income_message')
                  : I18n.t('insights.analytics.savings_rate.goal_hint')}
              </Text>
              {totalCategoryExclusions > 0 ? (
                <Text variant="label" tone="muted" className="mt-1">
                  {I18n.t('insights.analytics.savings_rate.exclusions_active', {
                    count: totalCategoryExclusions,
                  })}
                </Text>
              ) : null}
            </View>

            <View className="rounded-2xl border border-border/30 bg-card/90 px-3 py-2.5">
              <View className="flex-row items-center">
                <View className="flex-1 pr-2">
                  <Text variant="label" tone="muted">
                    {I18n.t('insights.calendar.income')}
                  </Text>
                  <Text variant="caption" className="text-success mt-0.5">
                    {renderValue(pageData.totalIncome)}
                  </Text>
                </View>
                <View className="h-10 w-px bg-border/35" />
                <View className="flex-1 px-2">
                  <Text variant="label" tone="muted">
                    {I18n.t('insights.calendar.expense')}
                  </Text>
                  <Text variant="caption" className="text-destructive mt-0.5">
                    {renderValue(pageData.totalExpense)}
                  </Text>
                </View>
                <View className="h-10 w-px bg-border/35" />
                <View className="flex-1 pl-2 items-end">
                  <Text variant="label" tone="muted">
                    {I18n.t('insights.calendar.net')}
                  </Text>
                  <Text
                    variant="caption"
                    className={cn(
                      'mt-0.5',
                      pageData.totalNet >= 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {renderSignedValue(pageData.totalNet)}
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-1.5">
              {pageData.savingsRateRows.map((row) => {
                const monthlyRate = row.savingsRate;
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
                      void triggerHaptic('selection');
                      openDrilldown({
                        label: row.label,
                        transactions: row.transactions,
                        showTypeFilter: true,
                      });
                    }}
                    className="rounded-xl border border-border/30 bg-card/90 px-2.5 py-2 active:opacity-85"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text variant="caption">{row.label}</Text>
                      <Text variant="caption" className={cn(monthlyToneClass)}>
                        {monthlyRate === null
                          ? I18n.t('insights.analytics.savings_rate.no_income_short')
                          : `${(monthlyRate * 100).toFixed(1)}%`}
                      </Text>
                    </View>
                    <View className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <View
                        className={cn('h-full rounded-full', monthlyBarClass)}
                        style={{ width: `${Math.round(monthlyIntensity * 100)}%` }}
                      />
                    </View>
                    <View className="mt-1.5 flex-row items-center justify-between gap-2">
                      <Text variant="label" tone="muted">
                        {I18n.t('insights.calendar.income')}: {renderValue(row.income)}
                      </Text>
                      <Text variant="label" tone="muted">
                        {I18n.t('insights.calendar.expense')}: {renderValue(row.expense)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </CardContent>
        </Card>
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
    if (pageData.kind === 'asset_history') {
      return renderAssetHistoryPane(pageData);
    }
    if (pageData.kind === 'analytics') {
      return renderAnalyticsPane(pageData);
    }
    if (pageData.kind === 'time_cost') {
      return renderTimeCostPane(pageData);
    }
    return renderBreakdownPane(pageData);
  };

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
    if (excludedAssetHistoryAccountIds.length === 0) return;
    const validAccountIds = new Set(assetHistoryAccountOptions.map((account) => account.id));
    setExcludedAssetHistoryAccountIds((previous) => {
      const next = previous.filter((accountId) => validAccountIds.has(accountId));
      return next.length === previous.length ? previous : next;
    });
  }, [assetHistoryAccountOptions, excludedAssetHistoryAccountIds.length]);
  const savingsIncomeCategoryPanel = useMemo(() => {
    const parents = categories
      .filter((category) => category.type === 'income' && !category.parentId)
      .map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon || '•',
      }));
    const parentIds = new Set(parents.map((parent) => parent.id));
    const childByParent = new Map<string, { id: string; name: string; icon: string }[]>();

    categories
      .filter(
        (category) =>
          category.type === 'income' && !!category.parentId && parentIds.has(category.parentId),
      )
      .forEach((category) => {
        const parentId = category.parentId as string;
        if (!childByParent.has(parentId)) childByParent.set(parentId, []);
        childByParent.get(parentId)?.push({
          id: category.id,
          name: category.name,
          icon: category.icon || '•',
        });
      });

    return { parents, childByParent };
  }, [categories]);
  const savingsExpenseCategoryPanel = useMemo(() => {
    const parents = categories
      .filter((category) => category.type === 'expense' && !category.parentId)
      .map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon || '•',
      }));
    const parentIds = new Set(parents.map((parent) => parent.id));
    const childByParent = new Map<string, { id: string; name: string; icon: string }[]>();

    categories
      .filter(
        (category) =>
          category.type === 'expense' && !!category.parentId && parentIds.has(category.parentId),
      )
      .forEach((category) => {
        const parentId = category.parentId as string;
        if (!childByParent.has(parentId)) childByParent.set(parentId, []);
        childByParent.get(parentId)?.push({
          id: category.id,
          name: category.name,
          icon: category.icon || '•',
        });
      });

    return { parents, childByParent };
  }, [categories]);
  const insightsFilterCount = useMemo(() => {
    if (!hasInsightsFilters) return 0;
    let count = 0;
    if (hasPeriodFilter && periodPreset !== 'month') count += 1;
    if (hasAccountFilter && selectedAccountIds.length > 0) count += 1;
    if (hasAssetHistoryAccountExclusionFilter) count += excludedAssetHistoryAccountIds.length;
    if (hasSavingsCategoryExclusionFilter)
      count += excludedSavingsIncomeCategoryIds.length + excludedSavingsExpenseCategoryIds.length;
    if (hasTimeCostExpenseCategoryExclusionFilter && excludedTimeCostExpenseCategoryId) count += 1;
    return count;
  }, [
    excludedAssetHistoryAccountIds.length,
    excludedTimeCostExpenseCategoryId,
    excludedSavingsExpenseCategoryIds.length,
    excludedSavingsIncomeCategoryIds.length,
    hasAccountFilter,
    hasAssetHistoryAccountExclusionFilter,
    hasSavingsCategoryExclusionFilter,
    hasTimeCostExpenseCategoryExclusionFilter,
    hasInsightsFilters,
    hasPeriodFilter,
    periodPreset,
    selectedAccountIds.length,
  ]);

  const resetInsightsFilters = useCallback(() => {
    const now = new Date();
    setPeriodPreset('month');
    setAnchorDate(startOfMonth(now));
    setCustomStart(formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
    setCustomEnd(formatDateInput(now));
    setActiveCustomDateField('start');
    setSelectedAccountIds([]);
    setExcludedSavingsIncomeCategoryIds([]);
    setExcludedSavingsExpenseCategoryIds([]);
    setExcludedTimeCostExpenseCategoryId(null);
    setExcludedAssetHistoryAccountIds([]);
    setAssetHistoryScrubMonthByYear({});
  }, []);

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
  const handleInsightTypeChange = useCallback(
    (value: string) => {
      const nextInsightType = value as InsightType;
      const nextInsightFilterConfig = getInsightFilterConfig(nextInsightType);
      const nextEffectivePeriodPreset = nextInsightFilterConfig.fixedPeriodPreset ?? periodPreset;
      const currentPeriodMode =
        effectivePeriodPreset === 'month'
          ? 'month'
          : effectivePeriodPreset === 'year'
            ? 'year'
            : 'other';
      const nextPeriodMode =
        nextEffectivePeriodPreset === 'month'
          ? 'month'
          : nextEffectivePeriodPreset === 'year'
            ? 'year'
            : 'other';

      if (
        (currentPeriodMode === 'year' && nextPeriodMode === 'month') ||
        (currentPeriodMode === 'month' && nextPeriodMode === 'year')
      ) {
        const now = new Date();
        setAnchorDate(startOfMonth(now));
      }

      setActiveBreakdownSlice(null, false);
      setSelectedCalendarDayKey(null);
      setSelectedInsightType(nextInsightType);
    },
    [effectivePeriodPreset, periodPreset, setActiveBreakdownSlice],
  );
  const handleOpenFiltersModal = useCallback(() => setIsFilterModalOpen(true), []);
  const isDrilldownSelectionMode = selectedDrilldownTransactionIds.length > 0;
  const selectedDrilldownTransactionCount = selectedDrilldownTransactionIds.length;
  const hasDrilldownBulkChanges = drilldownBulkDateTouched || drilldownBulkNoteTouched;
  const handleDrilldownHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setDrilldownHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 1 ? previous : nextHeight,
    );
  }, []);
  const openDrilldown = useCallback(
    (nextState: {
      label: string;
      transactions: TransactionWithRelations[];
      showTypeFilter?: boolean;
    }) => {
      if (nextState.showTypeFilter) {
        setDrilldownTypeFilter('expense');
      }
      setSelectedDrilldownTransactionIds([]);
      setShowDrilldownBulkUpdate(false);
      setDrilldownBulkDate(formatDateInput(new Date()));
      setDrilldownBulkDateTouched(false);
      setDrilldownBulkNote('');
      setDrilldownBulkNoteTouched(false);
      setDrilldownState(nextState);
    },
    [],
  );
  const handleCloseDrilldown = useCallback(() => {
    void triggerHaptic('selection');
    setDrilldownState(null);
    setDrilldownTypeFilter('expense');
    setSelectedDrilldownTransactionIds([]);
    setShowDrilldownBulkUpdate(false);
    setSelectedTransaction(null);
  }, []);
  const clearDrilldownSelection = useCallback(() => {
    void triggerHaptic('selection');
    setSelectedDrilldownTransactionIds([]);
  }, []);
  const toggleDrilldownTransactionSelection = useCallback((transactionId: string) => {
    setSelectedDrilldownTransactionIds((previous) =>
      previous.includes(transactionId)
        ? previous.filter((id) => id !== transactionId)
        : [...previous, transactionId],
    );
  }, []);
  const handleDrilldownTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isDrilldownSelectionMode) {
        toggleDrilldownTransactionSelection(transaction.id);
        return;
      }
      setSelectedTransaction(transaction);
    },
    [isDrilldownSelectionMode, toggleDrilldownTransactionSelection],
  );
  const handleDrilldownTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isDrilldownSelectionMode) {
        toggleDrilldownTransactionSelection(transaction.id);
        return;
      }
      setSelectedDrilldownTransactionIds([transaction.id]);
    },
    [isDrilldownSelectionMode, toggleDrilldownTransactionSelection],
  );
  const handleOpenDrilldownBulkUpdate = useCallback(() => {
    if (selectedDrilldownTransactionCount === 0) return;
    setDrilldownBulkDate(formatDateInput(new Date()));
    setDrilldownBulkDateTouched(false);
    setDrilldownBulkNote('');
    setDrilldownBulkNoteTouched(false);
    setShowDrilldownBulkUpdate(true);
  }, [selectedDrilldownTransactionCount]);
  const handleCloseDrilldownBulkUpdate = useCallback(() => {
    setShowDrilldownBulkUpdate(false);
  }, []);
  const handleApplyDrilldownBulkUpdate = useCallback(() => {
    if (selectedDrilldownTransactionIds.length === 0) return;
    if (!hasDrilldownBulkChanges) return;

    const updates: { date?: string; note?: string | null } = {};
    if (drilldownBulkDateTouched) updates.date = drilldownBulkDate;
    if (drilldownBulkNoteTouched) {
      const normalizedNote = drilldownBulkNote.trim();
      updates.note = normalizedNote.length > 0 ? normalizedNote : null;
    }
    if (Object.keys(updates).length === 0) return;

    selectedDrilldownTransactionIds.forEach((transactionId) => {
      updateTransaction(transactionId, updates);
    });
    setShowDrilldownBulkUpdate(false);
    setSelectedDrilldownTransactionIds([]);
  }, [
    drilldownBulkDate,
    drilldownBulkDateTouched,
    drilldownBulkNote,
    drilldownBulkNoteTouched,
    hasDrilldownBulkChanges,
    selectedDrilldownTransactionIds,
    updateTransaction,
  ]);
  const handleDeleteSelectedDrilldownTransactions = useCallback(() => {
    if (selectedDrilldownTransactionIds.length === 0) return;
    const idsToDelete = [...selectedDrilldownTransactionIds];
    Alert.alert(
      I18n.t('transactions.selection.delete_title'),
      I18n.t('transactions.selection.delete_message', { count: idsToDelete.length }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            idsToDelete.forEach((transactionId) => {
              deleteTransaction(transactionId);
            });
            setShowDrilldownBulkUpdate(false);
            setSelectedDrilldownTransactionIds([]);
          },
        },
      ],
    );
  }, [deleteTransaction, selectedDrilldownTransactionIds]);
  const resolvedDrilldownTransactions = useMemo(() => {
    if (!drilldownState) return [];
    return drilldownState.transactions
      .map((transaction) => transactionById.get(transaction.id))
      .filter((transaction): transaction is TransactionWithRelations => Boolean(transaction));
  }, [drilldownState, transactionById]);
  const drilldownIncomeTransactions = useMemo(
    () =>
      resolvedDrilldownTransactions.filter((transaction) => transaction.type === 'income'),
    [resolvedDrilldownTransactions],
  );
  const drilldownExpenseTransactions = useMemo(
    () =>
      resolvedDrilldownTransactions.filter((transaction) => transaction.type === 'expense'),
    [resolvedDrilldownTransactions],
  );
  const drilldownPagerExtraData = useMemo(
    () => ({
      drilldownTypeFilter,
      incomeTransactions: drilldownIncomeTransactions,
      expenseTransactions: drilldownExpenseTransactions,
      pageWidth,
      selectedTransactionIds: selectedDrilldownTransactionIds,
    }),
    [
      drilldownExpenseTransactions,
      drilldownIncomeTransactions,
      drilldownTypeFilter,
      pageWidth,
      selectedDrilldownTransactionIds,
    ],
  );
  const getDrilldownPagerItemLayout = useCallback(
    (_: ArrayLike<DrilldownTransactionFilter> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );
  const handleDrilldownPagerMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const rawIndex = event.nativeEvent.contentOffset.x / pageWidth;
      const index = Math.max(0, Math.min(DRILLDOWN_TYPE_PAGES.length - 1, Math.round(rawIndex)));
      const type = DRILLDOWN_TYPE_PAGES[index] ?? 'expense';
      if (type !== drilldownTypeFilter) {
        setDrilldownTypeFilter(type);
      }
    },
    [drilldownTypeFilter, pageWidth],
  );
  const handleDrilldownPagerScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const index = Math.max(0, Math.min(DRILLDOWN_TYPE_PAGES.length - 1, info.index));
      drilldownPagerRef.current?.scrollToOffset({ offset: index * pageWidth, animated: false });
    },
    [pageWidth],
  );
  const renderDrilldownPagerPage = useCallback(
    ({ item }: { item: DrilldownTransactionFilter }) => {
      const transactions =
        item === 'income' ? drilldownIncomeTransactions : drilldownExpenseTransactions;
      return (
        <View style={{ width: pageWidth, flex: 1 }}>
          <ActivityTransactionList
            transactions={transactions}
            onTransactionPress={handleDrilldownTransactionPress}
            onTransactionLongPress={handleDrilldownTransactionLongPress}
            selectedTransactionIds={selectedDrilldownTransactionIds}
            selectionMode={isDrilldownSelectionMode}
            emptyTitle={I18n.t('insights.empty_category.title')}
            emptyMessage={I18n.t('insights.empty_category.message')}
            contentPaddingBottom={30}
            compactItems
            listKey={`drilldown-${item}`}
          />
        </View>
      );
    },
    [
      drilldownExpenseTransactions,
      drilldownIncomeTransactions,
      handleDrilldownTransactionLongPress,
      handleDrilldownTransactionPress,
      isDrilldownSelectionMode,
      pageWidth,
      selectedDrilldownTransactionIds,
    ],
  );

  useEffect(() => {
    if (!isDrilldownSelectionMode) {
      setShowDrilldownBulkUpdate(false);
      return;
    }
    setSelectedTransaction(null);
  }, [isDrilldownSelectionMode]);

  useEffect(() => {
    if (selectedDrilldownTransactionIds.length === 0) return;
    const availableIds = new Set(resolvedDrilldownTransactions.map((transaction) => transaction.id));
    setSelectedDrilldownTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [resolvedDrilldownTransactions, selectedDrilldownTransactionIds.length]);

  useEffect(() => {
    if (!drilldownState?.showTypeFilter) return;
    const targetIndex = drilldownTypeFilter === 'income' ? 0 : 1;
    const frame = requestAnimationFrame(() => {
      drilldownPagerRef.current?.scrollToIndex({ index: targetIndex, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [drilldownState?.showTypeFilter, drilldownTypeFilter, pageWidth]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <MonthControlsHeader
        titleNode={
          <SelectField
            value={selectedInsightType}
            options={insightTypeOptions}
            optionsLayout="list"
            sheetTitle={I18n.t('insights.insight_type')}
            onChange={handleInsightTypeChange}
          />
        }
        monthLabel={activePeriodLabel}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        actions={
          hasInsightsFilters ? (
            <FilterIconButton onPress={handleOpenFiltersModal} count={insightsFilterCount} />
          ) : null
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
            extraData={insightsPagerExtraData}
            keyExtractor={(item) => String(item)}
            style={INSIGHTS_LIST_STYLE}
            horizontal
            pagingEnabled
            disableIntervalMomentum
            bounces={false}
            directionalLockEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            overScrollMode="never"
            nestedScrollEnabled
            removeClippedSubviews
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={7}
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

      <ThemeModal
        visible={!!drilldownState}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseDrilldown}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          {selectedTransaction ? (
            <EditTransactionScreen
              transaction={selectedTransaction}
              onClose={() => setSelectedTransaction(null)}
            />
          ) : showDrilldownBulkUpdate ? (
            <>
              <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text variant="subheading">
                    {I18n.t('transactions.selection.update_title', {
                      count: selectedDrilldownTransactionCount,
                    })}
                  </Text>
                  <Text variant="friendly" tone="muted">
                    {I18n.t('transactions.selection.update_subtitle')}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={handleCloseDrilldownBulkUpdate}
                    className="px-3 py-2 rounded-full bg-secondary/70"
                  >
                    <Text variant="caption" tone="muted">
                      {I18n.t('common.cancel')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleApplyDrilldownBulkUpdate}
                    disabled={!hasDrilldownBulkChanges}
                    className={cn(
                      'px-3 py-2 rounded-full',
                      hasDrilldownBulkChanges ? 'bg-primary' : 'bg-secondary/70',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={cn(
                        hasDrilldownBulkChanges ? 'text-white' : 'text-muted-foreground',
                      )}
                    >
                      {I18n.t('common.save')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView className="flex-1" contentContainerStyle={DRILLDOWN_BULK_SCROLL_CONTENT_STYLE}>
                <View className="gap-2.5">
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.editor.date')}
                  </Text>
                  <View
                    className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                    style={{ height: 360 }}
                  >
                    <DatePanel
                      value={drilldownBulkDate}
                      onSelect={(value) => {
                        setDrilldownBulkDate(value);
                        setDrilldownBulkDateTouched(true);
                      }}
                    />
                  </View>
                </View>

                <View className="gap-2.5">
                  <Input
                    label={I18n.t('transaction_detail.note')}
                    placeholder={I18n.t('transactions.editor.optional')}
                    value={drilldownBulkNote}
                    onChangeText={(value) => {
                      setDrilldownBulkNote(value);
                      setDrilldownBulkNoteTouched(true);
                    }}
                  />
                </View>
              </ScrollView>
            </>
          ) : (
            <>
              {isDrilldownSelectionMode ? (
                <View
                  className="bg-background pb-2 pt-2"
                  style={drilldownHeaderHeight > 0 ? { minHeight: drilldownHeaderHeight } : undefined}
                >
                  <View className="px-5 pt-2">
                    <View className="rounded-[26px] bg-card border border-border/40 px-3 py-2.5 flex-row items-center justify-between gap-2">
                      <Pressable
                        onPress={clearDrilldownSelection}
                        className="rounded-full bg-secondary/70 px-3 py-1.5 active:opacity-85"
                      >
                        <Text variant="caption" tone="muted">
                          {I18n.t('common.cancel')}
                        </Text>
                      </Pressable>

                      <Text variant="caption" className="text-foreground">
                        {I18n.t('transactions.selection.selected_count', {
                          count: selectedDrilldownTransactionCount,
                        })}
                      </Text>

                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={handleOpenDrilldownBulkUpdate}
                          className="rounded-full bg-primary/12 border border-primary/35 px-3 py-1.5 active:opacity-85"
                        >
                          <Text variant="caption" className="text-primary">
                            {I18n.t('transactions.selection.update')}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={handleDeleteSelectedDrilldownTransactions}
                          className="rounded-full bg-destructive/10 border border-destructive/35 px-3 py-1.5 active:opacity-85"
                        >
                          <Text variant="caption" className="text-destructive">
                            {I18n.t('common.delete')}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  className="px-5 pt-5 pb-3 flex-row items-center justify-between"
                  onLayout={handleDrilldownHeaderLayout}
                >
                  <View>
                    <Text variant="subheading">
                      {drilldownState?.label ?? I18n.t('insights.category_fallback')}
                    </Text>
                    <Text variant="friendly" tone="muted">
                      {I18n.t('insights.drilldown_subtitle')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleCloseDrilldown}
                    className="px-3 py-2 rounded-full bg-secondary"
                  >
                    <Text variant="caption" tone="muted">
                      {I18n.t('common.done')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {drilldownState?.showTypeFilter ? (
                <>
                  <View className="px-5 pb-2">
                    <View className="rounded-2xl border border-border/35 bg-card/90 px-3 py-2.5">
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="flex-1">
                          <Text
                            variant="label"
                            className={cn(
                              drilldownTypeFilter === 'income'
                                ? 'text-success'
                                : 'text-success/55',
                            )}
                          >
                            {I18n.t('insights.calendar.income')}
                          </Text>
                          <Text variant="caption" tone="muted" className="mt-0.5">
                            {I18n.t('insights.calendar.transactions')}: {drilldownIncomeTransactions.length}
                          </Text>
                        </View>
                        <View className="items-center px-2">
                          <Text variant="label" tone="muted">
                            {I18n.t('insights.drilldown_swipe_hint')}
                          </Text>
                        </View>
                        <View className="flex-1 items-end">
                          <Text
                            variant="label"
                            className={cn(
                              drilldownTypeFilter === 'expense'
                                ? 'text-destructive'
                                : 'text-destructive/55',
                            )}
                          >
                            {I18n.t('insights.calendar.expense')}
                          </Text>
                          <Text variant="caption" tone="muted" className="mt-0.5">
                            {I18n.t('insights.calendar.transactions')}: {drilldownExpenseTransactions.length}
                          </Text>
                        </View>
                      </View>
                      <View className="mt-2 flex-row items-center gap-1.5">
                        <View
                          className={cn(
                            'h-1.5 flex-1 rounded-full',
                            drilldownTypeFilter === 'income' ? 'bg-success/60' : 'bg-secondary',
                          )}
                        />
                        <View
                          className={cn(
                            'h-1.5 flex-1 rounded-full',
                            drilldownTypeFilter === 'expense'
                              ? 'bg-destructive/60'
                              : 'bg-secondary',
                          )}
                        />
                      </View>
                    </View>
                  </View>

                  <FlatList
                    ref={drilldownPagerRef}
                    data={DRILLDOWN_TYPE_PAGES}
                    extraData={drilldownPagerExtraData}
                    keyExtractor={(item) => item}
                    renderItem={renderDrilldownPagerPage}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    overScrollMode="never"
                    directionalLockEnabled
                    decelerationRate="fast"
                    showsHorizontalScrollIndicator={false}
                    getItemLayout={getDrilldownPagerItemLayout}
                    onMomentumScrollEnd={handleDrilldownPagerMomentumEnd}
                    onScrollToIndexFailed={handleDrilldownPagerScrollToIndexFailed}
                    style={INSIGHTS_LIST_STYLE}
                  />
                </>
              ) : (
                <ActivityTransactionList
                  transactions={resolvedDrilldownTransactions}
                  onTransactionPress={handleDrilldownTransactionPress}
                  onTransactionLongPress={handleDrilldownTransactionLongPress}
                  selectedTransactionIds={selectedDrilldownTransactionIds}
                  selectionMode={isDrilldownSelectionMode}
                  emptyTitle={I18n.t('insights.empty_category.title')}
                  emptyMessage={I18n.t('insights.empty_category.message')}
                  contentPaddingBottom={30}
                  compactItems
                />
              )}
            </>
          )}
        </SafeAreaView>
      </ThemeModal>

      <ThemeModal
        visible={hasInsightsFilters && isFilterModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
            <View>
              <Text variant="subheading">{I18n.t('insights.filters.title')}</Text>
              <Text variant="friendly" tone="muted">
                {I18n.t('insights.filters.subtitle')}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  resetInsightsFilters();
                }}
                className="px-3 py-2 rounded-full bg-secondary/70"
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
                className="px-3 py-2 rounded-full bg-secondary"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.done')}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 34, gap: 14 }}
          >
            {hasPeriodFilter ? (
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.period')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6 }}
                >
                  {PERIOD_TABS.map((tab) => (
                    <FilterPill
                      key={tab}
                      label={I18n.t(`insights.period.${tab}`)}
                      active={periodPreset === tab}
                      onPress={() => {
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
                      style={{ height: 360 }}
                    >
                      <DatePanel
                        value={activeCustomDateField === 'start' ? customStart : customEnd}
                        onSelect={(value) => handleCustomDateSelect(activeCustomDateField, value)}
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
                  contentContainerStyle={{ gap: 6 }}
                >
                  <FilterPill
                    label={I18n.t('insights.filters.all_accounts')}
                    active={selectedAccountIds.length === 0}
                    onPress={() => setSelectedAccountIds([])}
                  />
                  {accountOptions.map((a) => (
                    <FilterPill
                      key={a.id}
                      label={a.name}
                      active={selectedAccountIds.includes(a.id)}
                      onPress={() =>
                        setSelectedAccountIds((prev) =>
                          prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id],
                        )
                      }
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {hasAssetHistoryAccountExclusionFilter ? (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 pr-2">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.asset_history_accounts')}
                    </Text>
                    <Text variant="label" tone="muted" className="mt-1">
                      {I18n.t('insights.filters.include_accounts')}
                    </Text>
                  </View>
                  <FilterPill
                    label={I18n.t('insights.filters.all_selected')}
                    active={includedAssetHistoryAccountIds.length === assetHistoryAccountOptions.length}
                    onPress={() => setExcludedAssetHistoryAccountIds([])}
                  />
                </View>
                <View
                  className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                  style={{ height: 236 }}
                >
                  <AccountPanel
                    accounts={assetHistoryAccountOptions}
                    accountGroups={accountGroups}
                    selectedIds={includedAssetHistoryAccountIds}
                    onToggleSelect={(accountId) =>
                      setExcludedAssetHistoryAccountIds((previous) =>
                        previous.includes(accountId)
                          ? previous.filter((id) => id !== accountId)
                          : [...previous, accountId],
                      )
                    }
                  />
                </View>
              </View>
            ) : null}

            {hasTimeCostExpenseCategoryExclusionFilter ? (
              <View className="gap-2.5">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 pr-2">
                    <Text variant="caption" tone="muted">
                      {I18n.t('insights.filters.time_cost_exclusions')}
                    </Text>
                    <Text variant="label" tone="muted" className="mt-1">
                      {I18n.t('insights.filters.exclude_expense_categories')}
                    </Text>
                  </View>
                  <FilterPill
                    label={I18n.t('insights.filters.none')}
                    active={excludedTimeCostExpenseCategoryId === null}
                    onPress={() => setExcludedTimeCostExpenseCategoryId(null)}
                  />
                </View>
                <View
                  className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                  style={{ height: 236 }}
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
                <Text variant="caption" tone="muted">
                  {I18n.t('insights.filters.savings_exclusions')}
                </Text>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="label" tone="muted">
                      {I18n.t('insights.filters.exclude_income_categories')}
                    </Text>
                    <FilterPill
                      label={I18n.t('insights.filters.none')}
                      active={excludedSavingsIncomeCategoryIds.length === 0}
                      onPress={() => setExcludedSavingsIncomeCategoryIds([])}
                    />
                  </View>
                  <View
                    className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                    style={{ height: 236 }}
                  >
                    <CategoryPanel
                      parents={savingsIncomeCategoryPanel.parents}
                      childByParent={savingsIncomeCategoryPanel.childByParent}
                      selectedCategoryIds={excludedSavingsIncomeCategoryIds}
                      onToggleSelect={(categoryId) =>
                        setExcludedSavingsIncomeCategoryIds((prev) =>
                          prev.includes(categoryId)
                            ? prev.filter((id) => id !== categoryId)
                            : [...prev, categoryId],
                        )
                      }
                    />
                  </View>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="label" tone="muted">
                      {I18n.t('insights.filters.exclude_expense_categories')}
                    </Text>
                    <FilterPill
                      label={I18n.t('insights.filters.none')}
                      active={excludedSavingsExpenseCategoryIds.length === 0}
                      onPress={() => setExcludedSavingsExpenseCategoryIds([])}
                    />
                  </View>
                  <View
                    className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                    style={{ height: 236 }}
                  >
                    <CategoryPanel
                      parents={savingsExpenseCategoryPanel.parents}
                      childByParent={savingsExpenseCategoryPanel.childByParent}
                      selectedCategoryIds={excludedSavingsExpenseCategoryIds}
                      onToggleSelect={(categoryId) =>
                        setExcludedSavingsExpenseCategoryIds((prev) =>
                          prev.includes(categoryId)
                            ? prev.filter((id) => id !== categoryId)
                            : [...prev, categoryId],
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
    </SafeAreaView>
  );
}
