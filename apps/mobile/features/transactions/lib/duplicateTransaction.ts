import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { Transaction, TransactionWithRelations } from '~/types';

/**
 * A balance adjustment is a reconciliation of one account at one moment, so a
 * copy of it on another date is not a transaction the user could have made.
 * Everything else duplicates cleanly.
 */
export function canDuplicateTransaction(transaction: Pick<Transaction, 'type'>): boolean {
  return transaction.type !== 'balance_adjustment';
}

/** The selected rows that are worth duplicating, in their listed order. */
export function selectDuplicableTransactions<T extends TransactionWithRelations>(
  transactions: T[],
  selectedIds: string[],
): T[] {
  if (selectedIds.length === 0) return [];
  const selected = new Set(selectedIds);
  return transactions.filter((tx) => selected.has(tx.id) && canDuplicateTransaction(tx));
}

/**
 * Turns the picker's `YYYY-MM-DD` day key into the instant a transaction date
 * is stored as: local midnight, written as a UTC ISO string. The editor writes
 * its dates that way, so a duplicate has to as well or the copy sits on a
 * different day from an identical hand-entered row anywhere the raw column is
 * read. Falls back to the key itself if it is not a plain day.
 */
export function dayKeyToTransactionDate(dayKey: string): string {
  const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dayKey;
  const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  if (Number.isNaN(local.getTime())) return dayKey;
  return local.toISOString();
}

/**
 * The input for a copy of `transaction` on the day `dayKey`.
 *
 * Three groups of fields are deliberately dropped rather than copied:
 * - the frozen FX snapshot (`reportingCurrency`/`reportingAmount`/`fxRate`) and
 *   `accountAmount`, so `createTransaction` takes a fresh one at write time,
 *   exactly as it would for the same amount typed in by hand today;
 * - the reimbursement settlement links, which point at one specific refund;
 * - `receiptUri`, since a receipt is proof of a single purchase.
 */
export function buildDuplicateInput(
  transaction: Transaction,
  dayKey: string,
): CreateTransactionInput {
  return {
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    toAmount: transaction.toAmount ?? null,
    date: dayKeyToTransactionDate(dayKey),
    accountId: transaction.accountId ?? null,
    fromAccountId: transaction.fromAccountId ?? null,
    toAccountId: transaction.toAccountId ?? null,
    categoryId: transaction.categoryId ?? null,
    note: transaction.note ?? null,
    sentiment: transaction.sentiment,
    reimbursable: transaction.reimbursable ?? false,
    countsAsExpense: transaction.countsAsExpense ?? false,
  };
}
