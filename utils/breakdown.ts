import type { BreakdownItem } from '~/types';

/** Minimal transaction shape needed to aggregate a category breakdown. */
export interface BreakdownTxn {
  categoryId: string | null;
  amount: number;
  reportingAmount?: number | null;
  date: string;
}

/** Minimal category shape needed to resolve labels and root grouping. */
export interface BreakdownCategory {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface AggregateBreakdownOptions {
  /** Resolve a category (or its parent) by id; return undefined if missing. */
  resolveCategory: (id: string) => BreakdownCategory | undefined;
  /** Map a reporting amount + date to its display value (e.g. money or hours). */
  valueOf: (amount: number, date: string) => number;
  /** When true, roll subcategories up into their root category. */
  groupByRoot: boolean;
}

/**
 * Pure category-breakdown aggregation. Groups transactions by category (or root
 * category when `groupByRoot`), summing each group's display value, and returns
 * the groups sorted by amount descending.
 *
 * Transactions with no category, or whose category can't be resolved, are
 * skipped. Extracted from AppContext so the grouping/labeling rules are unit
 * tested independently of the DB and React.
 */
export function aggregateBreakdown(
  transactions: readonly BreakdownTxn[],
  { resolveCategory, valueOf, groupByRoot }: AggregateBreakdownOptions,
): BreakdownItem[] {
  const totals = new Map<string, { amount: number; label: string; parentLabel?: string }>();

  for (const txn of transactions) {
    if (!txn.categoryId) continue;
    const cat = resolveCategory(txn.categoryId);
    if (!cat) continue;
    const root = cat.parentId ? resolveCategory(cat.parentId) : cat;
    const id = groupByRoot ? (root?.id ?? cat.id) : cat.id;
    const inc = valueOf(txn.reportingAmount ?? txn.amount, txn.date);
    const current = totals.get(id);
    if (!current) {
      totals.set(id, {
        amount: inc,
        label: groupByRoot ? (root?.name ?? cat.name) : cat.name,
        parentLabel: groupByRoot ? undefined : root?.name,
      });
    } else {
      current.amount += inc;
    }
  }

  return Array.from(totals.entries())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.amount - a.amount);
}
