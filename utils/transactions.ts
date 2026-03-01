import type { TransactionWithRelations } from '~/types';
import { monthKeyFromIsoLocal } from '~/utils/formatters';

export interface MonthSummary {
  count: number;
  income: number;
  expense: number;
}

export interface MonthTransactionBuckets {
  transactionsMap: Map<string, TransactionWithRelations[]>;
  summaries: Map<string, MonthSummary>;
}

function transactionBelongsToWallet(
  transaction: Pick<TransactionWithRelations, 'accountId' | 'fromAccountId' | 'toAccountId'>,
  walletId: string,
): boolean {
  return (
    transaction.accountId === walletId ||
    transaction.fromAccountId === walletId ||
    transaction.toAccountId === walletId
  );
}

export function filterTransactionsByWallet(
  transactions: TransactionWithRelations[],
  walletId: string | null | undefined,
): TransactionWithRelations[] {
  if (!walletId) return transactions;
  return transactions.filter((transaction) => transactionBelongsToWallet(transaction, walletId));
}

export function emptyMonthSummary(): MonthSummary {
  return { count: 0, income: 0, expense: 0 };
}

function accumulateSummary(
  summary: MonthSummary,
  transaction: TransactionWithRelations,
  value: number,
): void {
  summary.count += 1;
  if (transaction.type === 'income') summary.income += value;
  if (transaction.type === 'expense') summary.expense += value;
}

export function summarizeTransactions(
  transactions: TransactionWithRelations[],
  resolveValue: (transaction: TransactionWithRelations) => number,
): MonthSummary {
  const summary = emptyMonthSummary();
  transactions.forEach((transaction) => {
    const value = resolveValue(transaction);
    accumulateSummary(summary, transaction, value);
  });
  return summary;
}

export function bucketTransactionsByMonth(
  transactions: TransactionWithRelations[],
  resolveValue: (transaction: TransactionWithRelations) => number,
): MonthTransactionBuckets {
  const transactionsMap = new Map<string, TransactionWithRelations[]>();
  const summaries = new Map<string, MonthSummary>();

  transactions.forEach((transaction) => {
    const key = monthKeyFromIsoLocal(transaction.date);
    const list = transactionsMap.get(key);
    if (list) {
      list.push(transaction);
    } else {
      transactionsMap.set(key, [transaction]);
    }

    const summary = summaries.get(key) ?? emptyMonthSummary();
    const value = resolveValue(transaction);
    accumulateSummary(summary, transaction, value);
    summaries.set(key, summary);
  });

  return { transactionsMap, summaries };
}
