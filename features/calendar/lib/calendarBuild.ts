import type { TransactionWithRelations } from '~/types';
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
}

const WEEKDAY_LABELS_CACHE = new Map<string, string[]>();
const MONTH_LABEL_CACHE = new Map<string, string>();
const CALENDAR_DATE_LABEL_CACHE = new Map<string, string>();

export function getCalendarWeekdayLabels(locale: string): string[] {
  const cached = WEEKDAY_LABELS_CACHE.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const monday = new Date(Date.UTC(2024, 0, 1));
  const labels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatter.format(date);
  });
  WEEKDAY_LABELS_CACHE.set(locale, labels);
  return labels;
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

export function weekdayColumnIndexMonday(dayKey: string): number {
  const date = dayKeyToUtcDate(dayKey);
  if (!date) return 0;
  const sundayFirst = date.getUTCDay();
  return (sundayFirst + 6) % 7;
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

export function buildCalendarMonth({
  monthAnchor,
  transactions,
  locale,
  isTimeMode,
  getDisplayValueForTransaction,
  todayDayKey,
}: BuildCalendarMonthInput): CalendarMonthData {
  const year = monthAnchor.getFullYear();
  const monthIndex = monthAnchor.getMonth();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthLabel = monthLabelFromMonthKey(monthKey, locale);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayKey = `${monthKey}-01`;
  const lastDayKey = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;

  const dailyByDayKey = new Map<string, CalendarDayAggregate>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const dayKey = dayKeyFromIsoLocal(tx.date);
    if (dayKey < firstDayKey || dayKey > lastDayKey) continue;
    const value = isTimeMode ? getDisplayValueForTransaction(tx) : tx.amount;
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
    if (tx.type === 'income') {
      agg.income += value;
      totalIncome += value;
    } else {
      agg.expense += value;
      totalExpense += value;
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
  const leading = weekdayColumnIndexMonday(firstDayKey);
  for (let i = 0; i < leading; i += 1) {
    cells.push({ kind: 'spacer', id: `${monthKey}-pre-${i}` });
  }

  let activeDayCount = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    const agg = dailyByDayKey.get(dayKey);
    if (agg && agg.transactionCount > 0) activeDayCount += 1;
    cells.push({
      kind: 'day',
      id: dayKey,
      dayKey,
      dayNumber: day,
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
