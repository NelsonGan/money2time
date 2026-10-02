import type { Category } from '~/types';
import { DEFAULT_SELECTION_FILTER_MODE, type SelectionFilterMode } from '~/utils/selectionFilter';

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
