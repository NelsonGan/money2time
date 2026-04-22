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
