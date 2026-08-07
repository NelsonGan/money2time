import type { Category, TransactionSentiment, TransactionWithRelations } from '~/types';
import { dayKeyFromDateLocal, dayKeyFromIsoLocal } from '~/utils/formatters';

import { periodContains, type ReviewPeriod } from './reviewPeriods';

/** Categories beyond this many roll into the implicit remainder of the list. */
const MAX_REVIEW_CATEGORIES = 6;
/** Transactions listed when a category row is expanded, before "others". */
const MAX_CATEGORY_ITEMS = 3;
/**
 * How many earlier periods the "vs your usual" pace card averages over when no
 * budget is set. Long enough to smooth a quiet period, short enough to still
 * track a genuine change in habit.
 */
export const PACE_SAMPLE_SIZE: Record<ReviewPeriod['zoom'], number> = {
  week: 4,
  month: 6,
  year: 3,
};

export interface ReviewBar {
  key: string;
  value: number;
  /** Inclusive day-key bounds, so the caller can label the bar for its zoom. */
  start: string;
  end: string;
  isPeak: boolean;
}

export interface ReviewCategoryItem {
  id: string;
  label: string;
  /** Account name and date, pre-joined by the caller's formatter. */
  accountName: string | null;
  dayKey: string;
  amount: number;
}

export interface ReviewCategory {
  id: string;
  label: string;
  /** Tagged icon value (see `constants/categoryIcons.ts`), or null. */
  icon: string | null;
  amount: number;
  /** Share of the period's total expense, 0..1. */
  share: number;
  /** Share of the *largest* category, 0..1 — drives the row's bar width. */
  barRatio: number;
  items: ReviewCategoryItem[];
  /** Spend in this category not covered by `items`. */
  restAmount: number;
  restCount: number;
}

export interface ReviewSentimentSlice {
  sentiment: TransactionSentiment;
  amount: number;
  /** Share of sentiment-attributed expense, 0..1. */
  share: number;
}

export interface ReviewStandouts {
  biggestExpense: { id: string; label: string; dayKey: string; amount: number } | null;
  busiestDay: { dayKey: string; count: number; amount: number } | null;
  /** Days inside the period with nothing logged, and the period's length. */
  quietDayCount: number;
  totalDayCount: number;
  entryCount: number;
}

export type ReviewPaceState = 'under' | 'close' | 'over';

export interface ReviewPace {
  kind: 'budget' | 'average';
  target: number;
  spent: number;
  /** `spent / target`, unclamped so an overspend reads above 1. */
  ratio: number;
  state: ReviewPaceState;
  /** Periods averaged; absent when `kind` is `budget`. */
  sampleSize?: number;
}

export interface ReviewSummary {
  period: ReviewPeriod;
  expense: number;
  income: number;
  net: number;
  /** `net / income`, 0..1, or null when nothing came in. */
  savedRatio: number | null;
  /** Change vs the immediately preceding period; null when there is no prior. */
  delta: { previousExpense: number; changeRatio: number } | null;
  /** Hours of life the period's spend cost, or null with no wage configured. */
  hours: number | null;
  hourlyRate: number;
  bars: ReviewBar[];
  barAverage: number;
  categories: ReviewCategory[];
  sentiment: ReviewSentimentSlice[];
  standouts: ReviewStandouts;
  pace: ReviewPace | null;
  /** True when the period holds no income and no expense at all. */
  isEmpty: boolean;
}

/** Sentinel root id for expenses with no category, so they still get a row. */
export const UNCATEGORIZED_ID = '__uncategorized__';

/** Reporting-currency value of a row, so totals never drift with live FX. */
function valueOf(transaction: TransactionWithRelations): number {
  return transaction.reportingAmount ?? transaction.amount;
}

function isLive(transaction: TransactionWithRelations): boolean {
  return !transaction.deletedAt;
}

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function dayKeysBetween(start: string, end: string): string[] {
  const keys: string[] = [];
  const cursor = parseDayKey(start);
  const last = parseDayKey(end);
  while (cursor.getTime() <= last.getTime()) {
    keys.push(dayKeyFromDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * A transaction's local day key.
 *
 * `transaction.date` is a full ISO timestamp, not a `YYYY-MM-DD` key. Comparing
 * it against a period bound directly would silently drop the period's last day
 * ('2026-07-31T12:00:00Z' > '2026-07-31') and give every row its own day
 * bucket, so every read of a date in this module goes through here.
 */
function dayKeyOf(transaction: TransactionWithRelations): string {
  return dayKeyFromIsoLocal(transaction.date);
}

/** Total expense inside a period, valued in the reporting currency. */
export function expenseTotalForPeriod(
  transactions: TransactionWithRelations[],
  period: ReviewPeriod,
): number {
  let total = 0;
  for (const transaction of transactions) {
    if (!isLive(transaction)) continue;
    if (transaction.type !== 'expense') continue;
    if (!periodContains(period, dayKeyOf(transaction))) continue;
    total += valueOf(transaction);
  }
  return total;
}

/**
 * Bar buckets for a period: one per day for a week, one per 7-day run for a
 * month, one per calendar month for a year. Bars carry their own bounds so the
 * caller can label them without re-deriving the calendar.
 */
function buildBars(period: ReviewPeriod, expenseByDay: Map<string, number>): ReviewBar[] {
  const dayKeys = dayKeysBetween(period.start, period.end);
  const buckets: { key: string; start: string; end: string; value: number }[] = [];

  if (period.zoom === 'week') {
    for (const dayKey of dayKeys) {
      buckets.push({
        key: dayKey,
        start: dayKey,
        end: dayKey,
        value: expenseByDay.get(dayKey) ?? 0,
      });
    }
  } else if (period.zoom === 'month') {
    for (let index = 0; index < dayKeys.length; index += 7) {
      const chunk = dayKeys.slice(index, index + 7);
      buckets.push({
        key: `w${index / 7 + 1}`,
        start: chunk[0],
        end: chunk[chunk.length - 1],
        value: chunk.reduce((sum, dayKey) => sum + (expenseByDay.get(dayKey) ?? 0), 0),
      });
    }
  } else {
    const byMonth = new Map<string, { start: string; end: string; value: number }>();
    for (const dayKey of dayKeys) {
      const monthKey = dayKey.slice(0, 7);
      const bucket = byMonth.get(monthKey);
      const value = expenseByDay.get(dayKey) ?? 0;
      if (bucket) {
        bucket.end = dayKey;
        bucket.value += value;
      } else {
        byMonth.set(monthKey, { start: dayKey, end: dayKey, value });
      }
    }
    for (const [monthKey, bucket] of byMonth) buckets.push({ key: monthKey, ...bucket });
  }

  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.value), 0);
  return buckets.map((bucket) => ({
    ...bucket,
    // Only mark a peak when something was actually spent, otherwise an empty
    // period would highlight its first bar for no reason.
    isPeak: peak > 0 && bucket.value === peak,
  }));
}

/**
 * Mean spend per *full* bar, which is not the same as `expense / bars.length`.
 *
 * A month splits into fixed 7-day runs, so a 31-day month ends on a 3-day stub
 * bar. Dividing by 5 there would understate the weekly average by ~15% and drop
 * the chart's average line below where it belongs, so the stub counts as the
 * fraction of a week it actually is.
 */
function averagePerBar(period: ReviewPeriod, bars: ReviewBar[], expense: number): number {
  if (bars.length === 0) return 0;
  // Week bars are single days and year bars are whole calendar months; both are
  // already whole units, so the plain bar count is right for them.
  if (period.zoom !== 'month') return expense / bars.length;

  const days = bars.reduce((total, bar) => total + daysBetween(bar.start, bar.end), 0);
  return days > 0 ? expense / (days / 7) : 0;
}

/** Inclusive day span between two day keys. */
function daysBetween(start: string, end: string): number {
  const ms = parseDayKey(end).getTime() - parseDayKey(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function buildCategories(
  expenses: TransactionWithRelations[],
  totalExpense: number,
  categories: Pick<Category, 'id' | 'parentId' | 'name' | 'icon'>[],
): ReviewCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const rootIdOf = (categoryId: string) => byId.get(categoryId)?.parentId ?? categoryId;

  const groups = new Map<string, { amount: number; rows: TransactionWithRelations[] }>();
  for (const transaction of expenses) {
    const rootId = transaction.categoryId ? rootIdOf(transaction.categoryId) : UNCATEGORIZED_ID;
    const group = groups.get(rootId) ?? { amount: 0, rows: [] };
    group.amount += valueOf(transaction);
    group.rows.push(transaction);
    groups.set(rootId, group);
  }

  const ordered = [...groups.entries()]
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, MAX_REVIEW_CATEGORIES);
  const largest = ordered[0]?.[1].amount ?? 0;

  return ordered.map(([rootId, group]) => {
    const category = byId.get(rootId);
    const rows = [...group.rows].sort((a, b) => valueOf(b) - valueOf(a));
    const items = rows.slice(0, MAX_CATEGORY_ITEMS).map((transaction) => ({
      id: transaction.id,
      label: transaction.note?.trim() || transaction.categoryName || (category?.name ?? ''),
      accountName: transaction.accountName ?? null,
      dayKey: dayKeyOf(transaction),
      amount: valueOf(transaction),
    }));
    const rest = rows.slice(MAX_CATEGORY_ITEMS);

    return {
      id: rootId,
      label: category?.name ?? '',
      icon: category?.icon ?? null,
      amount: group.amount,
      share: totalExpense > 0 ? group.amount / totalExpense : 0,
      barRatio: largest > 0 ? group.amount / largest : 0,
      items,
      restAmount: rest.reduce((sum, transaction) => sum + valueOf(transaction), 0),
      restCount: rest.length,
    };
  });
}

const SENTIMENTS: TransactionSentiment[] = ['happy', 'neutral', 'sad'];

function buildSentiment(expenses: TransactionWithRelations[]): ReviewSentimentSlice[] {
  const totals = new Map<TransactionSentiment, number>();
  let total = 0;
  for (const transaction of expenses) {
    const value = valueOf(transaction);
    totals.set(transaction.sentiment, (totals.get(transaction.sentiment) ?? 0) + value);
    total += value;
  }
  return SENTIMENTS.map((sentiment) => {
    const amount = totals.get(sentiment) ?? 0;
    return { sentiment, amount, share: total > 0 ? amount / total : 0 };
  });
}

function buildStandouts(
  period: ReviewPeriod,
  inPeriod: TransactionWithRelations[],
  expenses: TransactionWithRelations[],
): ReviewStandouts {
  const dayKeys = dayKeysBetween(period.start, period.end);

  let biggest: ReviewStandouts['biggestExpense'] = null;
  for (const transaction of expenses) {
    const amount = valueOf(transaction);
    if (biggest && amount <= biggest.amount) continue;
    biggest = {
      id: transaction.id,
      label: transaction.note?.trim() || transaction.categoryName || '',
      dayKey: dayKeyOf(transaction),
      amount,
    };
  }

  const perDay = new Map<string, { count: number; amount: number }>();
  for (const transaction of inPeriod) {
    const dayKey = dayKeyOf(transaction);
    const entry = perDay.get(dayKey) ?? { count: 0, amount: 0 };
    entry.count += 1;
    if (transaction.type === 'expense') entry.amount += valueOf(transaction);
    perDay.set(dayKey, entry);
  }

  let busiest: ReviewStandouts['busiestDay'] = null;
  for (const [dayKey, entry] of perDay) {
    if (busiest && entry.count <= busiest.count) continue;
    busiest = { dayKey, count: entry.count, amount: entry.amount };
  }

  return {
    biggestExpense: biggest,
    busiestDay: busiest,
    quietDayCount: dayKeys.filter((dayKey) => !perDay.has(dayKey)).length,
    totalDayCount: dayKeys.length,
    entryCount: inPeriod.length,
  };
}

function buildPace({
  zoom,
  spent,
  budgetTotal,
  previousExpenses,
}: {
  zoom: ReviewPeriod['zoom'];
  spent: number;
  budgetTotal: number | null;
  previousExpenses: number[];
}): ReviewPace | null {
  const stateFor = (ratio: number): ReviewPaceState =>
    ratio > 1 ? 'over' : ratio >= 0.9 ? 'close' : 'under';

  if (budgetTotal && budgetTotal > 0) {
    const ratio = spent / budgetTotal;
    return { kind: 'budget', target: budgetTotal, spent, ratio, state: stateFor(ratio) };
  }

  // With no budget, measure the period against the user's own recent habit.
  // Averaging in periods from before they started logging would drag the bar
  // down and make an ordinary week look like a blow-out, so only periods that
  // actually recorded spend count.
  const sample = previousExpenses.slice(0, PACE_SAMPLE_SIZE[zoom]).filter((value) => value > 0);
  if (sample.length === 0) return null;

  const target = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  if (target <= 0) return null;

  const ratio = spent / target;
  return {
    kind: 'average',
    target,
    spent,
    ratio,
    state: stateFor(ratio),
    sampleSize: sample.length,
  };
}

/**
 * Everything the review screen renders for one completed period.
 *
 * `previousExpenses` holds the expense totals of the periods immediately before
 * this one, nearest first — the caller derives them once for the whole rail
 * (see `expenseTotalForPeriod`) rather than re-scanning per card. Index 0 also
 * supplies the "lighter/heavier than last time" delta.
 */
export function buildReviewSummary({
  period,
  transactions,
  categories,
  hourlyRate,
  budgetTotal = null,
  previousExpenses = [],
}: {
  period: ReviewPeriod;
  transactions: TransactionWithRelations[];
  categories: Pick<Category, 'id' | 'parentId' | 'name' | 'icon'>[];
  hourlyRate: number;
  budgetTotal?: number | null;
  previousExpenses?: number[];
}): ReviewSummary {
  const inPeriod = transactions.filter(
    (transaction) => isLive(transaction) && periodContains(period, dayKeyOf(transaction)),
  );
  const expenses = inPeriod.filter((transaction) => transaction.type === 'expense');
  const incomes = inPeriod.filter((transaction) => transaction.type === 'income');

  const expense = expenses.reduce((sum, transaction) => sum + valueOf(transaction), 0);
  const income = incomes.reduce((sum, transaction) => sum + valueOf(transaction), 0);

  const expenseByDay = new Map<string, number>();
  for (const transaction of expenses) {
    const dayKey = dayKeyOf(transaction);
    expenseByDay.set(dayKey, (expenseByDay.get(dayKey) ?? 0) + valueOf(transaction));
  }

  const bars = buildBars(period, expenseByDay);
  const previousExpense = previousExpenses[0];

  return {
    period,
    expense,
    income,
    net: income - expense,
    savedRatio: income > 0 ? (income - expense) / income : null,
    delta:
      previousExpense === undefined || previousExpense <= 0
        ? null
        : {
            previousExpense,
            changeRatio: (expense - previousExpense) / previousExpense,
          },
    hours: hourlyRate > 0 ? expense / hourlyRate : null,
    hourlyRate,
    bars,
    barAverage: averagePerBar(period, bars, expense),
    categories: buildCategories(expenses, expense, categories),
    sentiment: buildSentiment(expenses),
    standouts: buildStandouts(period, inPeriod, expenses),
    pace: buildPace({ zoom: period.zoom, spent: expense, budgetTotal, previousExpenses }),
    isEmpty: inPeriod.length === 0,
  };
}
