import type { Transaction } from '~/types';

/**
 * How a filter reads the ids picked for it.
 *
 * `exclude` drops what was picked and keeps everything else, which is the
 * long-standing behaviour and still the default. `include` inverts it: only
 * what was picked survives ("show me just my Ryt Bank account"). In both modes
 * an empty pick means the filter is off, so flipping the mode before picking
 * anything never empties the screen.
 */
export type SelectionFilterMode = 'exclude' | 'include';

export const DEFAULT_SELECTION_FILTER_MODE: SelectionFilterMode = 'exclude';

export function isSelectionFilterMode(value: unknown): value is SelectionFilterMode {
  return value === 'exclude' || value === 'include';
}

/**
 * Whether a row passes one filter, given the ids it can be matched on (a
 * category and its parent, or every account a transfer touches).
 *
 * Excluding drops the row when **any** of its ids was picked; including keeps
 * it when any was. A row with no ids at all (an uncategorized expense) cannot
 * have been picked, so excluding keeps it and including drops it.
 */
export function passesSelectionFilter(
  mode: SelectionFilterMode,
  picked: ReadonlySet<string>,
  ids: readonly (string | null | undefined)[],
): boolean {
  if (picked.size === 0) return true;
  const matched = ids.some((id) => id != null && picked.has(id));
  return mode === 'include' ? matched : !matched;
}

/**
 * The account and category filters a transaction list can carry: one list of
 * picked ids per filter, each read through its own mode. The lists keep their
 * `excluded*` names because that is what the calendar and review preferences
 * have always persisted.
 */
export interface TransactionSelectionFilters {
  excludedAccountIds: string[];
  excludedExpenseCategoryIds: string[];
  excludedIncomeCategoryIds: string[];
  accountMode: SelectionFilterMode;
  expenseCategoryMode: SelectionFilterMode;
  incomeCategoryMode: SelectionFilterMode;
}

type FilterableTransaction = Pick<
  Transaction,
  'type' | 'accountId' | 'fromAccountId' | 'toAccountId' | 'categoryId'
>;

/**
 * Applies the account filter and the per-type category filters.
 *
 * A category pick matches the row's own category **or its parent**, so picking
 * a parent covers everything under it, and each list applies to its own type
 * only, so an expense pick never touches income. An account inclusion keeps a
 * transfer when either side of it was picked ("only my card" still shows the
 * card being paid off); an exclusion matches the row's own account only, as it
 * always has.
 *
 * Returns the input array untouched when nothing is picked, the common case,
 * so a memo downstream does not see a new array every render.
 */
export function applyTransactionSelectionFilters<T extends FilterableTransaction>(
  transactions: T[],
  filters: TransactionSelectionFilters,
  parentIdByCategoryId: ReadonlyMap<string, string | null>,
): T[] {
  if (
    filters.excludedAccountIds.length === 0 &&
    filters.excludedExpenseCategoryIds.length === 0 &&
    filters.excludedIncomeCategoryIds.length === 0
  ) {
    return transactions;
  }
  const accounts = new Set(filters.excludedAccountIds);
  const expenseCategories = new Set(filters.excludedExpenseCategoryIds);
  const incomeCategories = new Set(filters.excludedIncomeCategoryIds);
  const includeAccounts = filters.accountMode === 'include';

  return transactions.filter((transaction) => {
    const accountIds = includeAccounts
      ? [transaction.accountId, transaction.fromAccountId, transaction.toAccountId]
      : [transaction.accountId];
    if (!passesSelectionFilter(filters.accountMode, accounts, accountIds)) return false;
    if (transaction.type !== 'expense' && transaction.type !== 'income') return true;
    const categoryIds = transaction.categoryId
      ? [transaction.categoryId, parentIdByCategoryId.get(transaction.categoryId)]
      : [];
    return transaction.type === 'expense'
      ? passesSelectionFilter(filters.expenseCategoryMode, expenseCategories, categoryIds)
      : passesSelectionFilter(filters.incomeCategoryMode, incomeCategories, categoryIds);
  });
}
