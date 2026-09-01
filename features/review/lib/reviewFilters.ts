import type { Category, TransactionWithRelations } from '~/types';

/**
 * What the review page's filter sheet takes out of the report.
 *
 * All three are *exclusions* rather than inclusions: a review is a recap of
 * everything that happened, and the useful edit is "ignore my joint account" or
 * "ignore the salary that skews the saved ring", not "show me only these".
 * That also means an empty list is the honest default, so a newly added account
 * or category appears in the review without the user going looking for it.
 */
export interface ReviewFilters {
  excludedAccountIds: string[];
  excludedExpenseCategoryIds: string[];
  excludedIncomeCategoryIds: string[];
}

export const EMPTY_REVIEW_FILTERS: ReviewFilters = {
  excludedAccountIds: [],
  excludedExpenseCategoryIds: [],
  excludedIncomeCategoryIds: [],
};

/** How many exclusions are in force, for the header button's badge. */
export function reviewFilterCount(filters: ReviewFilters): number {
  return (
    filters.excludedAccountIds.length +
    filters.excludedExpenseCategoryIds.length +
    filters.excludedIncomeCategoryIds.length
  );
}

export function hasReviewFilters(filters: ReviewFilters): boolean {
  return reviewFilterCount(filters) > 0;
}

/**
 * Drops the excluded rows before any of the review's numbers are built, so a
 * single filter reaches the total, the trend, the categories, the mood split,
 * the standouts *and* the pace comparison against earlier periods at once.
 *
 * A category exclusion matches the row's own category **or its root**, which is
 * what makes selecting a parent in the picker exclude everything under it (the
 * same rule the insights trends use). It is applied per transaction type, so
 * excluding an expense category never silently removes income.
 *
 * Returns the input array untouched when nothing is excluded — the common case,
 * and what keeps the memo downstream from seeing a new array every render.
 */
export function applyReviewFilters(
  transactions: TransactionWithRelations[],
  filters: ReviewFilters,
  categories: Pick<Category, 'id' | 'parentId'>[],
): TransactionWithRelations[] {
  if (!hasReviewFilters(filters)) return transactions;

  const excludedAccounts = new Set(filters.excludedAccountIds);
  const excludedExpenseCategories = new Set(filters.excludedExpenseCategoryIds);
  const excludedIncomeCategories = new Set(filters.excludedIncomeCategoryIds);
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));

  const isExcludedCategory = (categoryId: string, excluded: Set<string>) => {
    if (excluded.size === 0) return false;
    if (excluded.has(categoryId)) return true;
    const parentId = parentById.get(categoryId);
    return parentId ? excluded.has(parentId) : false;
  };

  return transactions.filter((transaction) => {
    if (transaction.accountId && excludedAccounts.has(transaction.accountId)) return false;
    if (!transaction.categoryId) return true;
    if (transaction.type === 'expense') {
      return !isExcludedCategory(transaction.categoryId, excludedExpenseCategories);
    }
    if (transaction.type === 'income') {
      return !isExcludedCategory(transaction.categoryId, excludedIncomeCategories);
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
    : { excludedAccountIds, excludedExpenseCategoryIds, excludedIncomeCategoryIds };
}
