import type { Category, TransactionWithRelations } from '~/types';
import {
  applyTransactionSelectionFilters,
  DEFAULT_SELECTION_FILTER_MODE,
  type TransactionSelectionFilters,
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
export type ReviewFilters = TransactionSelectionFilters;

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
 * The matching rules (parents cover their children, each category list applies
 * to its own type, an account inclusion keeps transfers touching the account)
 * are the calendar's too, so both live in `applyTransactionSelectionFilters`.
 */
export function applyReviewFilters(
  transactions: TransactionWithRelations[],
  filters: ReviewFilters,
  categories: Pick<Category, 'id' | 'parentId'>[],
): TransactionWithRelations[] {
  if (reviewFilterCount(filters) === 0) return transactions;
  const parentIdByCategoryId = new Map(
    categories.map((category) => [category.id, category.parentId]),
  );
  return applyTransactionSelectionFilters(transactions, filters, parentIdByCategoryId);
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
