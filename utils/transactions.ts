import type { Transaction, TransactionWithRelations } from '~/types';
import { financialMonthKeyForIso } from '~/utils/financialMonth';
import { normalizeMoneyAmount } from '~/utils/formatters';

/**
 * The reimbursement fields of a transaction that carries no claim. Spread into
 * optimistically-constructed rows (payback transfers, recurring runs) so adding
 * a claim field later cannot silently leave one of them undefined.
 */
export const NO_REIMBURSEMENT: Pick<
  Transaction,
  | 'reimbursementStatus'
  | 'reimbursementPayer'
  | 'reimbursementAmount'
  | 'reimbursementClaimedAt'
  | 'reimbursedAt'
  | 'reimbursementAccountId'
  | 'reimbursementTransactionId'
> = {
  reimbursementStatus: null,
  reimbursementPayer: null,
  reimbursementAmount: null,
  reimbursementClaimedAt: null,
  reimbursedAt: null,
  reimbursementAccountId: null,
  reimbursementTransactionId: null,
};

/**
 * Reporting-currency value of some slice of a transaction (a split's share, a
 * reimbursement claim), preferring the parent's frozen `fxRate` so the result
 * never drifts when live rates move, and only falling back to a live rate when
 * no snapshot is available.
 *
 * The last resort returns the native amount rather than 0: counting a bill in
 * the wrong currency is a visible rounding error, dropping it silently is a
 * missing row the user cannot explain.
 */
export function reportingValueOfSlice(
  amount: number,
  transaction: Pick<Transaction, 'currency' | 'reportingCurrency' | 'fxRate'>,
  reportingCurrency: string,
  rateToReporting?: (currency: string) => number | null,
): number {
  if (transaction.currency === reportingCurrency) return amount;
  if (transaction.reportingCurrency === reportingCurrency && transaction.fxRate != null) {
    return amount * transaction.fxRate;
  }
  const rate = rateToReporting?.(transaction.currency);
  if (rate != null && Number.isFinite(rate)) return amount * rate;
  return amount;
}

/** The amount pair that has to move together on any partial write-down. */
export interface AmountWithReporting {
  amount: number;
  reportingAmount: number | null;
}

/**
 * Shifts a transaction's amount by `delta` (negative reduces it) and carries
 * the frozen reporting-currency snapshot along with it.
 *
 * Reporting-currency aggregates read `reportingAmount ?? amount`, so a write
 * that moves `amount` alone leaves every foreign-currency row counting its
 * original, un-reduced value forever. Partial write-downs (settling a split,
 * clearing a reimbursement) must go through here.
 *
 * The frozen `fxRate` is used deliberately rather than a live rate: it is the
 * rate captured at write time, so the pair stays internally consistent and the
 * historical total never drifts when rates move.
 */
export function adjustAmountWithReporting(
  transaction: Pick<Transaction, 'amount' | 'reportingAmount' | 'fxRate'>,
  delta: number,
): AmountWithReporting {
  const previousAmount = transaction.amount;
  const amount = normalizeMoneyAmount(previousAmount + delta);
  const { reportingAmount, fxRate } = transaction;
  if (reportingAmount == null) return { amount, reportingAmount: null };
  // Nothing left of the expense means nothing left of its reporting value,
  // whichever route got us here.
  if (amount === 0) return { amount, reportingAmount: 0 };
  if (fxRate != null && Number.isFinite(fxRate) && fxRate > 0) {
    return {
      amount,
      reportingAmount: normalizeMoneyAmount(reportingAmount + delta * fxRate),
    };
  }
  // No usable snapshot rate (legacy rows). Scale proportionally so the two
  // values still move in step instead of one of them freezing.
  if (previousAmount === 0) return { amount, reportingAmount };
  return {
    amount,
    reportingAmount: normalizeMoneyAmount(reportingAmount * (amount / previousAmount)),
  };
}

export interface MonthSummary {
  count: number;
  income: number;
  expense: number;
}

export interface MonthTransactionBuckets {
  transactionsMap: Map<string, TransactionWithRelations[]>;
  summaries: Map<string, MonthSummary>;
}

export function filterTransactionsByWallet(
  transactions: TransactionWithRelations[],
  walletId: string | null | undefined,
): TransactionWithRelations[] {
  if (!walletId) return transactions;
  const filtered: TransactionWithRelations[] = [];
  transactions.forEach((transaction) => {
    if (
      transaction.accountId === walletId ||
      transaction.fromAccountId === walletId ||
      transaction.toAccountId === walletId
    ) {
      filtered.push(transaction);
    }
  });
  return filtered;
}

export function emptyMonthSummary(): MonthSummary {
  return { count: 0, income: 0, expense: 0 };
}

function accumulateSummary(
  summary: MonthSummary,
  transaction: TransactionWithRelations,
  resolveValue: (transaction: TransactionWithRelations) => number,
): void {
  summary.count += 1;
  if (transaction.type !== 'income' && transaction.type !== 'expense') return;
  const value = resolveValue(transaction);
  if (transaction.type === 'income') summary.income += value;
  if (transaction.type === 'expense') summary.expense += value;
}

export function summarizeTransactions(
  transactions: TransactionWithRelations[],
  resolveValue: (transaction: TransactionWithRelations) => number,
): MonthSummary {
  const summary = emptyMonthSummary();
  transactions.forEach((transaction) => {
    accumulateSummary(summary, transaction, resolveValue);
  });
  return summary;
}

export function bucketTransactionsByMonth(
  transactions: TransactionWithRelations[],
  resolveValue: (transaction: TransactionWithRelations) => number,
  firstDayOfMonth = 1,
): MonthTransactionBuckets {
  const transactionsMap = new Map<string, TransactionWithRelations[]>();
  const summaries = new Map<string, MonthSummary>();

  transactions.forEach((transaction) => {
    const key = financialMonthKeyForIso(transaction.date, firstDayOfMonth);
    const list = transactionsMap.get(key);
    if (list) {
      list.push(transaction);
    } else {
      transactionsMap.set(key, [transaction]);
    }

    let summary = summaries.get(key);
    if (!summary) {
      summary = emptyMonthSummary();
      summaries.set(key, summary);
    }
    accumulateSummary(summary, transaction, resolveValue);
  });

  return { transactionsMap, summaries };
}
