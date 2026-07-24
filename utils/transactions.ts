import type { TransactionWithRelations } from '~/types';
import { financialMonthKeyForIso } from '~/utils/financialMonth';

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
