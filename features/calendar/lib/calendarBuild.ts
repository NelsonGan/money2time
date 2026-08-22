import { countsTowardSpending } from '~/features/reimbursements/lib/reimbursementMath';
import type { TransactionWithRelations, WeekStartsOn } from '~/types';
import { financialMonthDayKeys, financialMonthKeyForDate } from '~/utils/financialMonth';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { compareTransactionsByDateDesc } from '~/utils/transactionSorting';

export type CalendarDayAggregate = {
  dayKey: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  transactions: TransactionWithRelations[];
};

export type CalendarDayCell = {
  kind: 'day';
  id: string;
  dayKey: string;
  dayNumber: number;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  isFuture: boolean;
};

export type CalendarSpacerCell = { kind: 'spacer'; id: string };
export type CalendarGridCell = CalendarDayCell | CalendarSpacerCell;

export type CalendarMonthData = {
  monthKey: string;
  monthLabel: string;
  cells: CalendarGridCell[];
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  activeDayCount: number;
  firstDayKey: string;
  lastDayKey: string;
  maxAbsNet: number;
};

export interface BuildCalendarMonthInput {
  monthAnchor: Date;
  transactions: TransactionWithRelations[];
  locale: string;
  isTimeMode: boolean;
  getDisplayValueForTransaction: (tx: TransactionWithRelations) => number;
  todayDayKey: string;
  weekStartsOn: WeekStartsOn;
  firstDayOfMonth: number;
  /**
   * `settings.reimbursementsCountAsExpense`. When false, a reimbursable expense
   * (and its refund row) still shows in the day list but is left out of the
   * income/expense/net totals. Defaults to counting, so callers that predate
   * the setting are unaffected.
   */
  reimbursementsCountAsExpense?: boolean;
}

const WEEKDAY_LABELS_CACHE = new Map<string, string[]>();
const MONTH_LABEL_CACHE = new Map<string, string>();
const CALENDAR_DATE_LABEL_CACHE = new Map<string, string>();

export function getCalendarWeekdayLabels(locale: string, weekStartsOn: WeekStartsOn): string[] {
  const cacheKey = `${locale}|${weekStartsOn}`;
  const cached = WEEKDAY_LABELS_CACHE.get(cacheKey);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  // 2024-01-07 is a Sunday (UTC); shift by weekStartsOn to get the configured first day.
  const sunday = new Date(Date.UTC(2024, 0, 7));
  const labels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setUTCDate(sunday.getUTCDate() + weekStartsOn + index);
    return formatter.format(date);
  });
  WEEKDAY_LABELS_CACHE.set(cacheKey, labels);
  return labels;
}

/**
 * Whole calendar months between `anchor`'s month and the month that `dayKey`
 * falls in — positive when the day is in a later month, negative when earlier.
 *
 * `dayKey` is a literal YYYY-MM-DD calendar key, so its year/month are read
 * straight from the digits rather than from a `Date`'s local getters. Building a
 * `Date` from the key and reading `getMonth()` would shift the month across the
 * UTC boundary in timezones behind UTC (e.g. `Date.UTC(2026, 6, 1)` is June 30
 * locally in the Americas), which is exactly what made the calendar jump to the
 * previous month after a quick-entry. The anchor is a local start-of-month
 * `Date`, so its month is read with local getters. Returns null for a malformed
 * key so callers can fall back to a safe default.
 */
export function monthOffsetForDayKey(anchor: Date, dayKey: string): number | null {
  const [yearRaw, monthRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return (year - anchor.getFullYear()) * 12 + (month - 1 - anchor.getMonth());
}

export function dayKeyToUtcDate(dayKey: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Column index in a calendar grid where weekStartsOn is the leftmost column.
 * Result is in [0, 6].
 */
export function weekdayColumnIndex(dayKey: string, weekStartsOn: WeekStartsOn): number {
  const date = dayKeyToUtcDate(dayKey);
  if (!date) return 0;
  const sundayFirst = date.getUTCDay();
  return (sundayFirst - weekStartsOn + 7) % 7;
}

export function weekStartDayKey(dayKey: string, weekStartsOn: WeekStartsOn): string {
  const date = dayKeyToUtcDate(dayKey);
  if (!date) return dayKey;
  const col = weekdayColumnIndex(dayKey, weekStartsOn);
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - col);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, '0');
  const d = String(start.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function weekDayKeys(weekStartKey: string): string[] {
  const date = dayKeyToUtcDate(weekStartKey);
  if (!date) return [weekStartKey];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  });
}

export function monthLabelFromMonthKey(monthKey: string, locale: string): string {
  const cacheKey = `${locale}|${monthKey}`;
  const cached = MONTH_LABEL_CACHE.get(cacheKey);
  if (cached) return cached;
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return monthKey;
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(date.getTime())) return monthKey;
  const label = date.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  MONTH_LABEL_CACHE.set(cacheKey, label);
  return label;
}

export function formatCalendarDate(dayKey: string, locale: string): string {
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

function buildCalendarMonthCore(
  monthAnchor: Date,
  transactions: TransactionWithRelations[],
  locale: string,
  isTimeMode: boolean,
  getDisplayValueForTransaction: (tx: TransactionWithRelations) => number,
  todayDayKey: string,
  weekStartsOn: WeekStartsOn,
  firstDayOfMonth: number,
  reimbursementsCountAsExpense: boolean,
): CalendarMonthData {
  // A financial month (first day > 1) spans two calendar months, so the grid is
  // driven by the explicit list of day keys in the period rather than
  // 1..daysInMonth. At firstDayOfMonth === 1 this is exactly the calendar month.
  const monthKey = financialMonthKeyForDate(monthAnchor, firstDayOfMonth);
  const monthLabel = monthLabelFromMonthKey(monthKey, locale);
  const dayKeys = financialMonthDayKeys(monthKey, firstDayOfMonth);
  const firstDayKey = dayKeys[0] ?? `${monthKey}-01`;
  const lastDayKey = dayKeys[dayKeys.length - 1] ?? firstDayKey;

  const dailyByDayKey = new Map<string, CalendarDayAggregate>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    // Every transaction type (income, expense, transfer, balance adjustment)
    // counts toward the day's activity so it shows up in the grid and day list.
    // Only income/expense feed the income/expense/net totals, since transfers
    // and balance adjustments are not spending or earning.
    const dayKey = dayKeyFromIsoLocal(tx.date);
    let agg = dailyByDayKey.get(dayKey);
    if (!agg) {
      agg = {
        dayKey,
        income: 0,
        expense: 0,
        net: 0,
        transactionCount: 0,
        transactions: [],
      };
      dailyByDayKey.set(dayKey, agg);
    }
    if (
      (tx.type === 'income' || tx.type === 'expense') &&
      countsTowardSpending(tx, reimbursementsCountAsExpense)
    ) {
      const value = isTimeMode
        ? getDisplayValueForTransaction(tx)
        : (tx.reportingAmount ?? tx.amount);
      if (tx.type === 'income') {
        agg.income += value;
        totalIncome += value;
      } else {
        agg.expense += value;
        totalExpense += value;
      }
    }
    agg.transactions.push(tx);
    agg.transactionCount += 1;
  }

  let maxAbsNet = 0;
  dailyByDayKey.forEach((agg) => {
    agg.net = agg.income - agg.expense;
    const absNet = Math.abs(agg.net);
    if (absNet > maxAbsNet) maxAbsNet = absNet;
    if (agg.transactions.length > 1) {
      agg.transactions.sort((a, b) => compareTransactionsByDateDesc(a, b));
    }
  });

  const cells: CalendarGridCell[] = [];
  const leading = weekdayColumnIndex(firstDayKey, weekStartsOn);
  for (let i = 0; i < leading; i += 1) {
    cells.push({ kind: 'spacer', id: `${monthKey}-pre-${i}` });
  }

  let activeDayCount = 0;
  for (const dayKey of dayKeys) {
    const agg = dailyByDayKey.get(dayKey);
    if (agg && agg.transactionCount > 0) activeDayCount += 1;
    cells.push({
      kind: 'day',
      id: dayKey,
      dayKey,
      dayNumber: Number(dayKey.slice(8, 10)),
      income: agg?.income ?? 0,
      expense: agg?.expense ?? 0,
      net: agg ? agg.income - agg.expense : 0,
      transactionCount: agg?.transactionCount ?? 0,
      isFuture: dayKey > todayDayKey,
    });
  }

  const trailing = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let i = 0; i < trailing; i += 1) {
    cells.push({ kind: 'spacer', id: `${monthKey}-post-${i}` });
  }

  return {
    monthKey,
    monthLabel,
    cells,
    dailyByDayKey,
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense,
    activeDayCount,
    firstDayKey,
    lastDayKey,
    maxAbsNet,
  };
}

/**
 * Map a year to a scroll index in the year-view FlatList, clamped to the
 * list's fixed slot window. The year view only renders `totalSlots` years
 * centered on `centerYear` (via `centerIndex`); paging the day/month views to
 * a year outside that window and zooming out would otherwise produce an
 * out-of-range index and crash `scrollToIndex` (see Sentry MONEY2TIME-Z:
 * "scrollToIndex out of range: requested index -51 but minimum is 0"). Clamping
 * scrolls to the nearest edge year instead.
 */
export function yearViewIndexForYear(
  year: number,
  centerYear: number,
  centerIndex: number,
  totalSlots: number,
): number {
  const rawIndex = centerIndex + (year - centerYear);
  if (!Number.isFinite(rawIndex)) return centerIndex;
  return Math.max(0, Math.min(totalSlots - 1, rawIndex));
}

export function buildCalendarMonthFromGrouped(input: BuildCalendarMonthInput): CalendarMonthData {
  return buildCalendarMonthCore(
    input.monthAnchor,
    input.transactions,
    input.locale,
    input.isTimeMode,
    input.getDisplayValueForTransaction,
    input.todayDayKey,
    input.weekStartsOn,
    input.firstDayOfMonth,
    input.reimbursementsCountAsExpense ?? true,
  );
}
