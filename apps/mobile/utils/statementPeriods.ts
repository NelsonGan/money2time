import type { Account, MonthCycleInput, TransactionType, TransactionWithRelations } from '~/types';
import { financialMonthKeyForIso } from '~/utils/financialMonth';
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

/** Grace period a "days after statement" due date starts at (most Malaysian banks give ~20). */
export const DEFAULT_DUE_DAYS_AFTER_STATEMENT = 20;
export const MAX_DUE_DAYS_AFTER_STATEMENT = 45;

export function isDueDaysAfterStatement(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_DUE_DAYS_AFTER_STATEMENT
  );
}

/** `date` moved by whole calendar days, at local midnight (safe across DST). */
export function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export interface CreditCycleDates {
  statementDate: Date | null;
  dueDate: Date | null;
}

/**
 * Statement/due dates to surface for a credit card. With an unpaid statement
 * the last issued statement date (and its due date) is returned so the user
 * sees the bill they still owe; otherwise the upcoming cycle's dates.
 *
 * The bill is due on `dueDay` of the month after the statement, or, when
 * `dueDaysAfterStatement` is set, that many days after the statement date (so
 * months of different lengths do not move it). Without a statement day there
 * is nothing to count from, and the fixed `dueDay` is used.
 */
export function getCreditCycleDates(
  statementDay: number | null,
  dueDay: number | null,
  now: Date,
  hasUnpaidStatement: boolean,
  dueDaysAfterStatement: number | null = null,
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
  let dueDate: Date | null = null;
  if (dueDaysAfterStatement != null)
    dueDate = addCalendarDays(statementDate, dueDaysAfterStatement);
  else if (dueDay != null) dueDate = nextOccurrenceOfMonthDay(dueDay, statementDate);
  return { statementDate, dueDate };
}

/**
 * The first bill due on or after today under a days-after rule: the latest
 * statement's, or the next statement's once that one's due date has passed.
 * The account editor previews it under the field.
 */
export function nextDueDateAfterStatement(
  statementDay: number,
  dueDaysAfterStatement: number,
  now: Date,
): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastStatement = getCurrentStatementCycleStart(statementDay, now);
  const lastDue = addCalendarDays(lastStatement, dueDaysAfterStatement);
  if (lastDue.getTime() >= today.getTime()) return lastDue;
  const nextStatement = statementPeriodFromAnchor(lastStatement, statementDay, 0).end;
  return addCalendarDays(nextStatement, dueDaysAfterStatement);
}

/** The two columns that say when a credit card's bill is due. */
interface CreditDueColumns {
  creditDueDay: number | null;
  creditDueDaysAfterStatement: number | null;
}

/**
 * What a credit card saves for its due date. A fixed day is saved as it is.
 * A days-after rule also saves, as `creditDueDay`, the day of the month it
 * lands on for the latest statement, so readers that predate the rule (older
 * app versions, older backups and Web Dashboard pages) still show a due day
 * within a day or two of the real one. Without a statement day the rule has
 * nothing to count from, so the fixed day is kept for them as it was.
 */
export function creditDueColumns(
  statementDay: number | null,
  dueDay: number | null,
  dueDaysAfterStatement: number | null,
  now: Date,
): CreditDueColumns {
  if (dueDaysAfterStatement == null) {
    return { creditDueDay: dueDay, creditDueDaysAfterStatement: null };
  }
  const creditDueDay =
    statementDay == null
      ? dueDay
      : addCalendarDays(
          getCurrentStatementCycleStart(statementDay, now),
          dueDaysAfterStatement,
        ).getDate();
  return { creditDueDay, creditDueDaysAfterStatement: dueDaysAfterStatement };
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
  monthCycle: MonthCycleInput = 1,
): Map<string, TransactionWithRelations[]> {
  const map = new Map<string, TransactionWithRelations[]>();
  transactions.forEach((transaction) => {
    const key =
      statementDay != null
        ? statementPeriodKeyForTransactionDate(transaction.date, statementDay)
        : financialMonthKeyForIso(transaction.date, monthCycle);
    const list = map.get(key);
    if (list) list.push(transaction);
    else map.set(key, [transaction]);
  });
  return map;
}

/** Statement split of a credit card's balance, in the card's own currency. */
export interface CreditSummary {
  /** Billed on an issued statement and not yet paid. */
  payable: number;
  /** Spent since the last statement, not billed yet. */
  outstanding: number;
}

interface CreditDeltaTransaction {
  type: TransactionType;
  amount: number;
  toAmount?: number | null;
  accountAmount?: number | null;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
}

/**
 * How much a transaction moves a credit account's balance, **in that account's
 * own currency**. Mirrors the balance SQL in `accountsRepository.getBalances`:
 * a row entered in another currency carries the account-currency value in
 * `accountAmount` (`toAmount` for the receiving side of a transfer), so a
 * foreign-currency row must never be counted at its entered `amount`.
 */
export function creditDeltaForAccountTransaction(
  tx: CreditDeltaTransaction,
  creditAccountId: string,
) {
  const isLegacyBalanceAdjustmentTransfer =
    tx.type === 'transfer' && !!tx.accountId && !tx.fromAccountId && !tx.toAccountId;
  const ownAmount = tx.accountAmount ?? tx.amount;
  if (tx.type === 'expense' && tx.accountId === creditAccountId) return ownAmount;
  if (tx.type === 'income' && tx.accountId === creditAccountId) return -ownAmount;
  // A transfer's `amount` is in the sending account's currency, `toAmount` in
  // the receiving account's.
  if (tx.type === 'transfer' && tx.fromAccountId === creditAccountId) return tx.amount;
  if (tx.type === 'transfer' && tx.toAccountId === creditAccountId)
    return -(tx.toAmount ?? tx.amount);
  if (
    (tx.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer) &&
    tx.accountId === creditAccountId
  ) {
    return ownAmount;
  }
  return 0;
}

export function isCreditPaymentTransaction(
  tx: { type: TransactionType; toAccountId?: string | null },
  creditAccountId: string,
) {
  return tx.type === 'transfer' && tx.toAccountId === creditAccountId;
}

/**
 * Splits a credit card's balance into what an issued statement still bills
 * (payable) and what has been spent since (outstanding). Both come out in the
 * card's own currency, since `balance` and the per-transaction deltas are.
 */
export function computeCreditCycleSummary(
  account: Pick<Account, 'id' | 'creditStatementDay'>,
  txns: (CreditDeltaTransaction & { date: string })[],
  balance: number,
  now: Date,
): CreditSummary {
  if (!account.creditStatementDay) {
    return { outstanding: Math.max(0, balance), payable: 0 };
  }
  const currentCycleStartIso = getCurrentStatementCycleStart(
    account.creditStatementDay,
    now,
  ).toISOString();
  let cycleDelta = 0;
  txns.forEach((tx) => {
    if (tx.date < currentCycleStartIso) return;
    // Credit-card payments should settle statement payable first.
    if (isCreditPaymentTransaction(tx, account.id)) return;
    cycleDelta += creditDeltaForAccountTransaction(tx, account.id);
  });
  const outstandingFromCycle = Math.max(0, cycleDelta);
  const cappedBalance = Math.max(0, balance);
  const outstanding = Math.min(outstandingFromCycle, cappedBalance);
  return { outstanding, payable: Math.max(0, cappedBalance - outstanding) };
}
