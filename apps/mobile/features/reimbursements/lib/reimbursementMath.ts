/**
 * Reimbursements: an expense someone else is going to pay you back for.
 *
 * Everything here is pure so the spending filter can be tested on its own, and
 * so the aggregation modules that consume it (insights, budget, review, the
 * calendar, the widgets) stay free of context.
 */

/**
 * The reimbursement columns as they sit on a row that has nothing to do with a
 * reimbursement. Spread into freshly-built transactions (optimistic rows, test
 * fixtures) so a new column here does not have to be repeated at every site.
 */
export const NO_REIMBURSEMENT: {
  reimbursable: boolean;
  reimbursedAt: string | null;
  reimbursementAccountId: string | null;
  reimbursementTransactionId: string | null;
  reimbursementOfId: string | null;
} = {
  reimbursable: false,
  reimbursedAt: null,
  reimbursementAccountId: null,
  reimbursementTransactionId: null,
  reimbursementOfId: null,
};

/** The reimbursement fields any spending aggregation needs to see. */
export interface ReimbursementFields {
  type: string;
  reimbursable: boolean;
  reimbursementOfId: string | null;
}

/** The extra fields the reimbursements page reads on top of the above. */
export interface ReimbursementEntryFields extends ReimbursementFields {
  id: string;
  date: string;
  reimbursedAt: string | null;
  reimbursementAccountId: string | null;
  reimbursementTransactionId: string | null;
  deletedAt?: string | null;
}

/**
 * True for both halves of a reimbursement: the flagged expense and the income
 * row written when it was paid back.
 *
 * They are treated as one unit on purpose. Excluding only the expense would
 * leave the refund counting as income, so turning the setting off would show a
 * surplus that never existed.
 */
export function isReimbursementLinked(transaction: ReimbursementFields): boolean {
  // The type is checked for the same reason the page checks it: a flagged
  // expense can be edited into a transfer, and a stray flag on a row that is no
  // longer an expense must not quietly drop it from the totals while the
  // Reimbursements page shows nothing to explain why.
  return (
    (transaction.type === 'expense' && transaction.reimbursable) ||
    transaction.reimbursementOfId !== null
  );
}

/**
 * Whether a transaction belongs in spending analytics (expense totals, category
 * breakdowns, budgets, trends, the calendar, the widgets).
 *
 * Note this governs *analytics only*. Account balances, credit-card statement
 * periods and asset history always count every row, because the money really
 * did leave the account whatever the user's preference says.
 */
export function countsTowardSpending(
  transaction: ReimbursementFields,
  reimbursementsCountAsExpense: boolean,
): boolean {
  if (reimbursementsCountAsExpense) return true;
  return !isReimbursementLinked(transaction);
}

/**
 * Drops the reimbursement rows out of a list bound for a spending aggregation.
 * Returns the original array untouched when the setting is on, so the default
 * path allocates nothing.
 */
export function filterSpendingTransactions<T extends ReimbursementFields>(
  transactions: T[],
  reimbursementsCountAsExpense: boolean,
): T[] {
  if (reimbursementsCountAsExpense) return transactions;
  return transactions.filter((transaction) => !isReimbursementLinked(transaction));
}

/**
 * Only an expense can be reimbursed. The type is checked rather than assumed
 * because a flagged expense can be edited into a transfer, which leaves the
 * flag behind on a row that must not show up as something to claim.
 */
function isReimbursableRow(transaction: ReimbursementEntryFields): boolean {
  return transaction.type === 'expense' && transaction.reimbursable && !transaction.deletedAt;
}

/** An expense the user ticked but has not been paid back for yet. */
export function isPendingReimbursement(transaction: ReimbursementEntryFields): boolean {
  return isReimbursableRow(transaction) && !transaction.reimbursedAt;
}

/**
 * An expense the user ticked and has since marked as paid back.
 *
 * Deliberately looser than the pending check: a settled row keeps its refund
 * entry, so it has to stay reachable here for undo even if it somehow lost the
 * flag or stopped being an expense.
 */
export function isSettledReimbursement(transaction: ReimbursementEntryFields): boolean {
  return !!transaction.reimbursedAt && !transaction.deletedAt;
}

/**
 * How many expenses are waiting to be claimed. The Settings tile badge only
 * needs the number, so this counts in one pass rather than going through
 * `bucketReimbursements`, which also allocates and sorts two arrays.
 */
export function countPendingReimbursements(transactions: ReimbursementEntryFields[]): number {
  let count = 0;
  for (const transaction of transactions) {
    if (isPendingReimbursement(transaction)) count += 1;
  }
  return count;
}

export interface ReimbursementBuckets<T> {
  pending: T[];
  settled: T[];
}

/**
 * Splits the flagged expenses into what is still owed and what has come back.
 * Pending is newest-first; settled is most-recently-reimbursed first, which is
 * the order the page reads them back in.
 */
export function bucketReimbursements<T extends ReimbursementEntryFields>(
  transactions: T[],
): ReimbursementBuckets<T> {
  const pending: T[] = [];
  const settled: T[] = [];
  transactions.forEach((transaction) => {
    if (isPendingReimbursement(transaction)) pending.push(transaction);
    else if (isSettledReimbursement(transaction)) settled.push(transaction);
  });
  pending.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  settled.sort((a, b) => {
    const left = a.reimbursedAt ?? '';
    const right = b.reimbursedAt ?? '';
    return left < right ? 1 : left > right ? -1 : 0;
  });
  return { pending, settled };
}

/** Keeps the refund row's note readable when the expense note is long. */
const REFUND_NOTE_MAX_CHARS = 40;

/**
 * Note for the income row written when a reimbursement is paid back: the
 * localized prefix, plus the original expense's note when it had one.
 */
export function buildRefundNote(prefix: string, expenseNote: string | null | undefined): string {
  const note = expenseNote?.trim() ?? '';
  if (!note) return prefix;
  const short =
    note.length > REFUND_NOTE_MAX_CHARS ? `${note.slice(0, REFUND_NOTE_MAX_CHARS - 1)}..` : note;
  return `${prefix}: ${short}`;
}
