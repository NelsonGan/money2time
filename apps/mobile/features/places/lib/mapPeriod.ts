/**
 * The spending map's period: one month, one year, or everything. Months follow
 * the user's month cycle like the Calendar (README: Key patterns > financial
 * month), so "November" covers the same days in both; the cycle defaults to
 * calendar months.
 */

import type { MonthCycleInput, Transaction } from '~/types';
import {
  addFinancialMonths,
  financialMonthKeyForDate,
  financialMonthRange,
  financialMonthStartDate,
} from '~/utils/financialMonth';

export type MapPeriodKind = 'month' | 'year' | 'all';

export interface MapPeriod {
  kind: MapPeriodKind;
  /** Any moment inside the month or year shown (local time). */
  anchor: Date;
}

/** The day after `inclusive`, local midnight. */
function dayAfter(inclusive: Date): Date {
  return new Date(inclusive.getFullYear(), inclusive.getMonth(), inclusive.getDate() + 1);
}

/** The month key (`YYYY-MM`) the anchor's cycle is labelled with. */
function monthKeyOf(period: MapPeriod, cycle: MonthCycleInput): string {
  return financialMonthKeyForDate(period.anchor, cycle);
}

/**
 * [start, end) in local time; null bounds for "all". A year runs from its
 * January cycle to the end of its December cycle, like the Insights year.
 */
export function periodRange(
  period: MapPeriod,
  cycle: MonthCycleInput = 1,
): { start: Date | null; end: Date | null } {
  if (period.kind === 'all') return { start: null, end: null };
  if (period.kind === 'year') {
    const year = period.anchor.getFullYear();
    return {
      start: financialMonthStartDate(`${year}-01`, cycle),
      end: dayAfter(financialMonthRange(`${year}-12`, cycle).endInclusive),
    };
  }
  const { start, endInclusive } = financialMonthRange(monthKeyOf(period, cycle), cycle);
  return { start, end: dayAfter(endInclusive) };
}

export function shiftPeriod(
  period: MapPeriod,
  step: -1 | 1,
  cycle: MonthCycleInput = 1,
): MapPeriod {
  if (period.kind === 'all') return period;
  if (period.kind === 'year') {
    return { ...period, anchor: new Date(period.anchor.getFullYear() + step, 0, 15) };
  }
  return { ...period, anchor: addFinancialMonths(period.anchor, step, cycle) };
}

/** Whether the period after this one would start in the future. */
export function isLatestPeriod(
  period: MapPeriod,
  cycle: MonthCycleInput = 1,
  now = new Date(),
): boolean {
  if (period.kind === 'all') return true;
  const { end } = periodRange(period, cycle);
  return end !== null && end.getTime() > now.getTime();
}

export function inPeriod(dateIso: string, period: MapPeriod, cycle: MonthCycleInput = 1): boolean {
  const { start, end } = periodRange(period, cycle);
  if (!start || !end) return true;
  const time = new Date(dateIso).getTime();
  return time >= start.getTime() && time < end.getTime();
}

/** "November 2026" (the cycle's own month, as the Calendar names it), "2026" or `allLabel`. */
export function periodLabel(
  period: MapPeriod,
  locale: string,
  allLabel: string,
  cycle: MonthCycleInput = 1,
): string {
  if (period.kind === 'all') return allLabel;
  const [year, month1] = monthKeyOf(period, cycle).split('-').map(Number) as [number, number];
  const date = period.kind === 'year' ? period.anchor : new Date(year, month1 - 1, 1);
  const options: Intl.DateTimeFormatOptions =
    period.kind === 'year' ? { year: 'numeric' } : { month: 'long', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(date);
  }
}

/** What the map counts at a place: expenses as spending, income apart. */
export function isMapTransaction(transaction: Transaction): boolean {
  return (
    !transaction.deletedAt && (transaction.type === 'expense' || transaction.type === 'income')
  );
}

export interface PlaceTotals {
  spent: number;
  earned: number;
  visits: number;
}

/**
 * A place's totals in the value the app shows: money in the main currency
 * (the amount frozen at save for a foreign one) or hours in time mode, which
 * `value` returns. Every entry is a visit; only those `counts` lets through
 * add to the money (reimbursements, when the user leaves them out of spending).
 */
export function placeTotals<T extends Transaction>(
  transactions: readonly T[],
  value: (transaction: T) => number,
  counts: (transaction: T) => boolean = () => true,
): PlaceTotals {
  let spent = 0;
  let earned = 0;
  for (const transaction of transactions) {
    if (!counts(transaction)) continue;
    const amount = Math.abs(value(transaction));
    if (transaction.type === 'expense') spent += amount;
    else if (transaction.type === 'income') earned += amount;
  }
  return { spent, earned, visits: transactions.length };
}
