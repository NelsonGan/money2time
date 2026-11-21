/** The spending map's period: one month, one year, or everything. */

import type { Transaction } from '~/types';

export type MapPeriodKind = 'month' | 'year' | 'all';

export interface MapPeriod {
  kind: MapPeriodKind;
  /** Any moment inside the month or year shown (local time). */
  anchor: Date;
}

/** [start, end) in local time; null bounds for "all". */
export function periodRange(period: MapPeriod): { start: Date | null; end: Date | null } {
  if (period.kind === 'all') return { start: null, end: null };
  const y = period.anchor.getFullYear();
  if (period.kind === 'year') return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  const m = period.anchor.getMonth();
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
}

export function shiftPeriod(period: MapPeriod, step: -1 | 1): MapPeriod {
  if (period.kind === 'all') return period;
  const anchor = new Date(period.anchor);
  if (period.kind === 'year') anchor.setFullYear(anchor.getFullYear() + step, 0, 1);
  else anchor.setMonth(anchor.getMonth() + step, 1);
  return { ...period, anchor };
}

/** Whether the period after this one would start in the future. */
export function isLatestPeriod(period: MapPeriod, now = new Date()): boolean {
  if (period.kind === 'all') return true;
  const { end } = periodRange(period);
  return end !== null && end.getTime() > now.getTime();
}

export function inPeriod(dateIso: string, period: MapPeriod): boolean {
  const { start, end } = periodRange(period);
  if (!start || !end) return true;
  const time = new Date(dateIso).getTime();
  return time >= start.getTime() && time < end.getTime();
}

export function periodLabel(period: MapPeriod, locale: string, allLabel: string): string {
  if (period.kind === 'all') return allLabel;
  const options: Intl.DateTimeFormatOptions =
    period.kind === 'year' ? { year: 'numeric' } : { month: 'long', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(period.anchor);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(period.anchor);
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
