import type { BudgetPeriod, MonthCycleInput, WeekStartsOn } from '~/types';
import {
  addFinancialMonths,
  financialMonthKeyForDate,
  financialMonthRange,
  financialMonthStartDate,
} from '~/utils/financialMonth';
import { dateFromDayKeyLocal, dayKeyFromDateLocal, dayKeyFromIsoLocal } from '~/utils/formatters';

/**
 * Budget periods and their keys.
 *
 * - week: 'YYYY-MM-DD', the week's first day under `settings.weekStartsOn`. A
 *   week budget always covers its key day and the six days after it, so one
 *   made before the user changed the week's first day keeps its own 7 days.
 * - month: 'YYYY-MM', a financial month under the month cycle (as before).
 * - year: 'YYYY', a calendar year (January to December).
 *
 * The three key shapes never collide, which keeps old code that compares keys
 * as plain strings safe.
 */
export const BUDGET_PERIODS = ['week', 'month', 'year'] as const satisfies readonly BudgetPeriod[];

export interface BudgetPeriodClock {
  weekStartsOn: WeekStartsOn;
  monthCycle: MonthCycleInput;
}

/** Inclusive day keys bounding a period. */
export interface BudgetPeriodRange {
  start: string;
  end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const YEAR_KEY = /^\d{4}$/;

/** True when `key` has the shape `period` uses. */
export function isBudgetPeriodKey(period: BudgetPeriod, key: string): boolean {
  if (period === 'week') return WEEK_KEY.test(key);
  if (period === 'month') return MONTH_KEY.test(key);
  return YEAR_KEY.test(key);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Local midnight of the first day of the week `date` falls in. */
function startOfBudgetWeek(date: Date, weekStartsOn: WeekStartsOn): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(day, -((day.getDay() - weekStartsOn + 7) % 7));
}

/** The key of the period of `period` that `date` falls in. */
export function budgetPeriodKeyForDate(
  period: BudgetPeriod,
  date: Date,
  clock: BudgetPeriodClock,
): string {
  if (period === 'week') return dayKeyFromDateLocal(startOfBudgetWeek(date, clock.weekStartsOn));
  if (period === 'month') return financialMonthKeyForDate(date, clock.monthCycle);
  return String(date.getFullYear());
}

/** The days a period covers (see the module comment for how each is keyed). */
export function budgetPeriodRange(
  period: BudgetPeriod,
  key: string,
  monthCycle: MonthCycleInput,
): BudgetPeriodRange {
  if (period === 'week') {
    return { start: key, end: dayKeyFromDateLocal(addDays(dateFromDayKeyLocal(key), 6)) };
  }
  if (period === 'month') {
    const { start, endInclusive } = financialMonthRange(key, monthCycle);
    return { start: dayKeyFromDateLocal(start), end: dayKeyFromDateLocal(endInclusive) };
  }
  return { start: `${key}-01-01`, end: `${key}-12-31` };
}

/** Whether a transaction date (ISO or day key) falls inside a range. */
export function isIsoInBudgetRange(dateIso: string, range: BudgetPeriodRange): boolean {
  const dayKey = dayKeyFromIsoLocal(dateIso);
  return dayKey >= range.start && dayKey <= range.end;
}

/** The key `offset` periods after `key` (negative goes back). */
export function addBudgetPeriods(
  period: BudgetPeriod,
  key: string,
  offset: number,
  monthCycle: MonthCycleInput,
): string {
  if (period === 'week') {
    return dayKeyFromDateLocal(addDays(dateFromDayKeyLocal(key), 7 * offset));
  }
  if (period === 'month') {
    const shifted = addFinancialMonths(
      financialMonthStartDate(key, monthCycle),
      offset,
      monthCycle,
    );
    return financialMonthKeyForDate(shifted, monthCycle);
  }
  return String(Number(key) + offset);
}

/**
 * The key of the slot a stored budget belongs on in a pager laid out with the
 * current settings: its own key, except for a week budget made under another
 * first day of the week, which lands on the week its first day falls in.
 */
export function budgetSlotKey(
  period: BudgetPeriod,
  key: string,
  weekStartsOn: WeekStartsOn,
): string {
  if (period !== 'week') return key;
  return dayKeyFromDateLocal(startOfBudgetWeek(dateFromDayKeyLocal(key), weekStartsOn));
}

/** Whole days from `today` to the period's last day, inclusive of today (0 once it has ended). */
export function budgetDaysLeft(range: BudgetPeriodRange, today: Date): number {
  const end = dateFromDayKeyLocal(range.end);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const length = budgetRangeLength(range);
  return Math.max(0, Math.min(days, length));
}

/** Number of days a range covers. */
export function budgetRangeLength(range: BudgetPeriodRange): number {
  const start = dateFromDayKeyLocal(range.start);
  const end = dateFromDayKeyLocal(range.end);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * Whether a week starting on `key` shares a day with any of `weekKeys`. Week
 * budgets made before the user changed the week's first day keep their own
 * seven days, so a new week must not overlap one of them, or those days would
 * count twice.
 */
export function budgetWeekOverlaps(key: string, weekKeys: readonly string[]): boolean {
  const start = dateFromDayKeyLocal(key).getTime();
  return weekKeys.some(
    (other) => Math.abs(Math.round((dateFromDayKeyLocal(other).getTime() - start) / DAY_MS)) < 7,
  );
}

/**
 * The budget of `period` whose own days include `dayKey`, or null. Matching
 * by the budget's days rather than its key keeps a week budget made under
 * another first day of the week counted for the days it really covers. When
 * two overlap (possible only after that setting changed), the later one wins.
 */
export function budgetCoveringDay<T extends { period: BudgetPeriod; periodKey: string }>(
  budgets: T[],
  period: BudgetPeriod,
  dayKey: string,
  monthCycle: MonthCycleInput,
): T | null {
  let found: T | null = null;
  for (const budget of budgets) {
    if (budget.period !== period) continue;
    const range = budgetPeriodRange(period, budget.periodKey, monthCycle);
    if (dayKey < range.start || dayKey > range.end) continue;
    if (!found || budget.periodKey > found.periodKey) found = budget;
  }
  return found;
}
