import type { Category, TransactionWithRelations } from '~/types';
import {
  DEFAULT_SELECTION_FILTER_MODE,
  passesSelectionFilter,
  type SelectionFilterMode,
} from '~/utils/selectionFilter';

/** Every insights filter row whose picks can be read as an exclusion or an inclusion. */
export const INSIGHTS_FILTER_KEYS = [
  'assetHistoryAccounts',
  'expenseTrendAccounts',
  'expenseTrendExpenseCategories',
  'incomeTrendAccounts',
  'incomeTrendIncomeCategories',
  'categoryTrendAccounts',
  'expenseBreakdownCategories',
  'incomeBreakdownCategories',
  'savingsIncomeCategories',
  'savingsExpenseCategories',
] as const;
export type InsightsFilterKey = (typeof INSIGHTS_FILTER_KEYS)[number];
/** Only rows flipped away from the default are stored; a missing key reads as exclude. */
export type InsightsFilterModes = Partial<Record<InsightsFilterKey, SelectionFilterMode>>;

export function filterModeOf(
  modes: InsightsFilterModes,
  key: InsightsFilterKey,
): SelectionFilterMode {
  return modes[key] ?? DEFAULT_SELECTION_FILTER_MODE;
}

/**
 * The ids a category filter matches a row on: its own category and that
 * category's parent, so picking a parent covers everything under it. An
 * uncategorized row has none, so an exclusion keeps it and an inclusion drops it.
 */
export function categoryFilterIds(
  categoryId: string | null,
  categoryById: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): (string | null)[] {
  if (!categoryId) return [];
  return [categoryId, categoryById.get(categoryId)?.parentId ?? null];
}

export function parseInsightsFilterModes(value: unknown): InsightsFilterModes | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const next: InsightsFilterModes = {};
  INSIGHTS_FILTER_KEYS.forEach((key) => {
    if (record[key] === 'include') next[key] = 'include';
  });
  return next;
}

/** Predicate: returns true when a transaction should count toward savings. */
export type SavingsIncludePredicate = (
  transaction: Pick<TransactionWithRelations, 'type' | 'categoryId'>,
) => boolean;

/**
 * The Insights "Savings rate" filter, shared by the chart and the home-screen
 * savings widgets so the two cannot disagree. Each list is read through its
 * mode: excluding drops the income/expense rows whose category (or its parent)
 * was picked, including keeps only those. An empty list is off either way, and
 * an uncategorized row, which cannot have been picked, survives an exclusion
 * but not an inclusion.
 */
export function buildSavingsIncludePredicate(
  categories: Pick<Category, 'id' | 'parentId'>[],
  savingsIncomeCategoryIds: string[],
  savingsExpenseCategoryIds: string[],
  incomeMode: SelectionFilterMode = DEFAULT_SELECTION_FILTER_MODE,
  expenseMode: SelectionFilterMode = DEFAULT_SELECTION_FILTER_MODE,
): SavingsIncludePredicate {
  const incomeSet = new Set(savingsIncomeCategoryIds);
  const expenseSet = new Set(savingsExpenseCategoryIds);
  if (incomeSet.size === 0 && expenseSet.size === 0) return () => true;

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return (transaction) => {
    const ids = categoryFilterIds(transaction.categoryId, categoryById);
    return transaction.type === 'income'
      ? passesSelectionFilter(incomeMode, incomeSet, ids)
      : passesSelectionFilter(expenseMode, expenseSet, ids);
  };
}
