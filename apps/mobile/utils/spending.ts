import type { TransactionType } from '~/types';

/**
 * The minimum a row must expose for the spending readouts to classify it.
 *
 * Deliberately structural rather than `Transaction`: the album stat query and
 * the widget snapshot both aggregate narrower row shapes, and neither should
 * have to widen its SELECT to answer this question.
 */
export interface CountedSpendingRow {
  type: TransactionType | string;
  countsAsExpense?: boolean | null;
}

/**
 * Whether a row belongs in an expense total.
 *
 * Ordinary expenses always do. A **transfer** does only when it was stamped at
 * write time, which today means a loan repayment recorded while that loan's
 * "count instalment as expense" toggle was on: the money moves between two of
 * the user's own accounts, but the borrower feels it as spending and asked for
 * it to be counted.
 *
 * This governs *analytics only*. Account balances, credit-card statement
 * periods and asset history always treat the row as the transfer it is —
 * otherwise the debt would stop falling, which is the whole point of modelling
 * a repayment as a transfer in the first place.
 *
 * Nothing is stamped unless the user opted in, so on a database with no
 * counted rows this is exactly `type === 'expense'`.
 */
export function countsAsExpenseRow(transaction: CountedSpendingRow): boolean {
  if (transaction.type === 'expense') return true;
  return transaction.type === 'transfer' && !!transaction.countsAsExpense;
}

/** A counted transfer, but not an ordinary expense. */
export function isCountedTransfer(transaction: CountedSpendingRow): boolean {
  return transaction.type === 'transfer' && !!transaction.countsAsExpense;
}

/** The fields `asSpendingRow` rewrites when it reshapes a counted transfer. */
interface ReshapableRow extends CountedSpendingRow {
  accountId?: string | null;
  fromAccountId?: string | null;
  accountName?: string | null;
  fromAccountName?: string | null;
}

/**
 * An expense-shaped view of a counted transfer, so a spending pipeline that
 * already handles expenses needs no further teaching.
 *
 * Two rewrites, both load-bearing:
 *
 * - `type` becomes `expense`, which is what every downstream total, breakdown
 *   and trend switches on.
 * - `accountId` becomes the **funding** account. An expense is owned by one
 *   account, and the account the money actually left is the funding side; a
 *   readout scoped to "this account" would otherwise drop the row (a transfer's
 *   `accountId` is null) and attribute nothing.
 *
 * The amount is untouched: a transfer's `amount` is already denominated in the
 * from-account's currency, which is exactly what an expense on that account
 * means. Cross-currency repayments carry the loan-side figure in `toAmount`,
 * which no spending readout reads.
 *
 * Every other row — including an ordinary expense — is returned as-is, so the
 * default path allocates nothing.
 */
export function asSpendingRow<T extends ReshapableRow>(transaction: T): T {
  if (!isCountedTransfer(transaction)) return transaction;
  return {
    ...transaction,
    type: 'expense',
    accountId: transaction.fromAccountId ?? null,
    ...(transaction.fromAccountName !== undefined
      ? { accountName: transaction.fromAccountName ?? null }
      : {}),
  };
}

/**
 * Reshapes every counted transfer in a list. Returns the original array
 * untouched when there is nothing to reshape, which is the overwhelmingly
 * common case, so no counted loans means no copy.
 */
export function toSpendingRows<T extends ReshapableRow>(transactions: T[]): T[] {
  let index = 0;
  while (index < transactions.length) {
    const transaction = transactions[index];
    if (transaction && isCountedTransfer(transaction)) break;
    index += 1;
  }
  if (index === transactions.length) return transactions;
  return transactions.map(asSpendingRow);
}
