import type { TransactionWithRelations } from '~/types';
import { monthKeyFromDateLocal, monthKeyFromIsoLocal } from '~/utils/formatters';

export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface StatementPeriod {
  start: Date;
  end: Date;
  key: string;
}

const rangeFormatterCache = new Map<string, Intl.DateTimeFormat>();
function getRangeFormatter(locale: string): Intl.DateTimeFormat {
  const cached = rangeFormatterCache.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  rangeFormatterCache.set(locale, formatter);
  return formatter;
}

export function formatStatementRangeSublabel(
  start: Date,
  endInclusive: Date,
  locale: string,
): string {
  const formatter = getRangeFormatter(locale);
  return `${formatter.format(start)} – ${formatter.format(endInclusive)}`;
}

export function formatStatementDateLabel(date: Date, locale: string): string {
  return getRangeFormatter(locale).format(date);
}

export function clampStatementDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(day, 1), lastDay));
}

export function getCurrentStatementCycleStart(statementDay: number, now: Date): Date {
  const thisMonth = clampStatementDate(now.getFullYear(), now.getMonth(), statementDay);
  if (thisMonth.getTime() <= now.getTime()) return thisMonth;
  return clampStatementDate(now.getFullYear(), now.getMonth() - 1, statementDay);
}

export function statementPeriodFromAnchor(
  anchorCycleStart: Date,
  statementDay: number,
  offset: number,
): StatementPeriod {
  const start = clampStatementDate(
    anchorCycleStart.getFullYear(),
    anchorCycleStart.getMonth() + offset,
    statementDay,
  );
  const end = clampStatementDate(
    anchorCycleStart.getFullYear(),
    anchorCycleStart.getMonth() + offset + 1,
    statementDay,
  );
  return { start, end, key: monthKeyFromDateLocal(end) };
}

/** Next occurrence of a day-of-month strictly after `after` (clamped to month length). */
export function nextOccurrenceOfMonthDay(day: number, after: Date): Date {
  const sameMonth = clampStatementDate(after.getFullYear(), after.getMonth(), day);
  if (sameMonth.getTime() > after.getTime()) return sameMonth;
  return clampStatementDate(after.getFullYear(), after.getMonth() + 1, day);
}

export interface CreditCycleDates {
  statementDate: Date | null;
  dueDate: Date | null;
}

/**
 * Statement/due dates to surface for a credit card. With an unpaid statement
 * the last issued statement date (and its due date) is returned so the user
 * sees the bill they still owe; otherwise the upcoming cycle's dates.
 */
export function getCreditCycleDates(
  statementDay: number | null,
  dueDay: number | null,
  now: Date,
  hasUnpaidStatement: boolean,
): CreditCycleDates {
  if (statementDay == null) {
    return {
      statementDate: null,
      dueDate: dueDay == null ? null : nextOccurrenceOfMonthDay(dueDay, now),
    };
  }
  const lastStatement = getCurrentStatementCycleStart(statementDay, now);
  const statementDate = hasUnpaidStatement
    ? lastStatement
    : statementPeriodFromAnchor(lastStatement, statementDay, 0).end;
  return {
    statementDate,
    dueDate: dueDay == null ? null : nextOccurrenceOfMonthDay(dueDay, statementDate),
  };
}

export function statementPeriodKeyForTransactionDate(
  transactionIsoDate: string,
  statementDay: number,
): string {
  const date = new Date(transactionIsoDate);
  if (Number.isNaN(date.getTime())) return monthKeyFromIsoLocal(transactionIsoDate);
  const cycleStart = clampStatementDate(date.getFullYear(), date.getMonth(), statementDay);
  // Cycle is [cycleStart, nextCycleStart). If date < cycleStart, it's in the previous cycle.
  const actualCycleStart =
    date.getTime() >= cycleStart.getTime()
      ? cycleStart
      : clampStatementDate(date.getFullYear(), date.getMonth() - 1, statementDay);
  const cycleEnd = clampStatementDate(
    actualCycleStart.getFullYear(),
    actualCycleStart.getMonth() + 1,
    statementDay,
  );
  return monthKeyFromDateLocal(cycleEnd);
}

export function bucketTransactionsByAccountPeriod(
  transactions: TransactionWithRelations[],
  statementDay: number | null,
): Map<string, TransactionWithRelations[]> {
  const map = new Map<string, TransactionWithRelations[]>();
  transactions.forEach((transaction) => {
    const key =
      statementDay != null
        ? statementPeriodKeyForTransactionDate(transaction.date, statementDay)
        : monthKeyFromIsoLocal(transaction.date);
    const list = map.get(key);
    if (list) list.push(transaction);
    else map.set(key, [transaction]);
  });
  return map;
}
