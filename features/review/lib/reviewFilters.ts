import type { Category, TransactionWithRelations } from '~/types';
import {
  DEFAULT_SELECTION_FILTER_MODE,
  passesSelectionFilter,
  type SelectionFilterMode,
} from '~/utils/selectionFilter';

/**
 * What the review page's filter sheet takes out of the report.
 *
 * Each list defaults to an *exclusion*: a review is a recap of everything that
 * happened, and the common edit is "ignore my joint account" or "ignore the
 * salary that skews the saved ring". Each one can be flipped to an inclusion
 * ("only my card") through its `*Mode`, in which case the same list names what
 * to keep. The list keys keep their `excluded*` names because they are what the
 * insights preferences blob has always persisted. An empty list is off in
 * either mode, so a newly added account or category still appears by default.
 */
export interface ReviewFilters {
  excludedAccountIds: string[];
  excludedExpenseCategoryIds: string[];
  excludedIncomeCategoryIds: string[];
  accountMode: SelectionFilterMode;
  expenseCategoryMode: SelectionFilterMode;
  incomeCategoryMode: SelectionFilterMode;
}

export const EMPTY_REVIEW_FILTERS: ReviewFilters = {
  excludedAccountIds: [],
  excludedExpenseCategoryIds: [],
  excludedIncomeCategoryIds: [],
  accountMode: DEFAULT_SELECTION_FILTER_MODE,
  expenseCategoryMode: DEFAULT_SELECTION_FILTER_MODE,
  incomeCategoryMode: DEFAULT_SELECTION_FILTER_MODE,
};

/** How many picks are in force, for the header button's badge. */
export function reviewFilterCount(filters: ReviewFilters): number {
  return (
    filters.excludedAccountIds.length +
    filters.excludedExpenseCategoryIds.length +
    filters.excludedIncomeCategoryIds.length
  );
}

/**
 * Drops the filtered-out rows before any of the review's numbers are built, so a
 * single filter reaches the total, the trend, the categories, the mood split,
 * the standouts *and* the pace comparison against earlier periods at once.
 *
 * A category exclusion matches the row's own category **or its root**, which is
 * what makes selecting a parent in the picker exclude everything under it (the
 * same rule the insights trends use). It is applied per transaction type, so
 * excluding an expense category never silently removes income.
 *
 * An account inclusion keeps a transfer when either side of it was picked, so
 * "only my card" still shows the card being paid off. An exclusion matches the
 * row's own account only, as it always has.
 *
 * Returns the input array untouched when nothing is picked — the common case,
 * and what keeps the memo downstream from seeing a new array every render.
 */
export function applyReviewFilters(
  transactions: TransactionWithRelations[],
  filters: ReviewFilters,
  categories: Pick<Category, 'id' | 'parentId'>[],
): TransactionWithRelations[] {
  if (reviewFilterCount(filters) === 0) return transactions;

  const accounts = new Set(filters.excludedAccountIds);
  const expenseCategories = new Set(filters.excludedExpenseCategoryIds);
  const incomeCategories = new Set(filters.excludedIncomeCategoryIds);
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  const includeAccounts = filters.accountMode === 'include';

  return transactions.filter((transaction) => {
    const accountIds = includeAccounts
      ? [transaction.accountId, transaction.fromAccountId, transaction.toAccountId]
      : [transaction.accountId];
    if (!passesSelectionFilter(filters.accountMode, accounts, accountIds)) return false;
    const categoryIds = transaction.categoryId
      ? [transaction.categoryId, parentById.get(transaction.categoryId)]
      : [];
    if (transaction.type === 'expense') {
      return passesSelectionFilter(filters.expenseCategoryMode, expenseCategories, categoryIds);
    }
    if (transaction.type === 'income') {
      return passesSelectionFilter(filters.incomeCategoryMode, incomeCategories, categoryIds);
    }
    return true;
  });
}

/**
 * Forgets exclusions whose account or category has since been deleted, so a
 * stale id cannot sit in the badge count forever with nothing behind it.
 */
export function pruneReviewFilters(
  filters: ReviewFilters,
  accountIds: Set<string>,
  expenseCategoryIds: Set<string>,
  incomeCategoryIds: Set<string>,
): ReviewFilters {
  const excludedAccountIds = filters.excludedAccountIds.filter((id) => accountIds.has(id));
  const excludedExpenseCategoryIds = filters.excludedExpenseCategoryIds.filter((id) =>
    expenseCategoryIds.has(id),
  );
  const excludedIncomeCategoryIds = filters.excludedIncomeCategoryIds.filter((id) =>
    incomeCategoryIds.has(id),
  );

  const unchanged =
    excludedAccountIds.length === filters.excludedAccountIds.length &&
    excludedExpenseCategoryIds.length === filters.excludedExpenseCategoryIds.length &&
    excludedIncomeCategoryIds.length === filters.excludedIncomeCategoryIds.length;

  return unchanged
    ? filters
    : { ...filters, excludedAccountIds, excludedExpenseCategoryIds, excludedIncomeCategoryIds };
}
