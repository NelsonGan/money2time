/**
 * The Budgets page's maths, as the app's (features/budget/lib/budgetMath.ts
 * `buildBudgetSummary`). Pure, its value imports ending in `.ts`, so the
 * tests read it.
 */

import { budgetRate, budgetSpendValue, latestBudgetRate } from "./budget-currency.ts";
import type { BudgetMonth, Model, Tx } from "./model";

/**
 * Counted spending by month, in one pass, for the budget maths. A loan
 * repayment counted as spending depletes its budget line like any expense, as
 * the app's Budget screen has it (`asSpendingRow`).
 */
export function expensesByMonth(model: Model): Map<string, Tx[]> {
  const byMonth = new Map<string, Tx[]>();
  for (const tx of model.txs) {
    if (!tx.spending) continue;
    const list = byMonth.get(tx.month);
    if (list) list.push(tx);
    else byMonth.set(tx.month, [tx]);
  }
  return byMonth;
}

/**
 * The app's budget maths (features/budget/lib/budgetMath.ts). Every figure is
 * in the budget's currency: spending in it counts as entered, the rest through
 * the budget's frozen rate (or the latest one); spending with no rate at all
 * is left out and counted in `unconverted`. `rate` is one unit of the
 * budget's currency in the main one (1 for a main-currency budget). Spending
 * in an album counts toward the total always, and toward no category's line
 * (README: Key patterns > Albums): the page lists each album on its own.
 */
export function budgetSummary(model: Pick<Model, "categories" | "currency" | "raw" | "toBase" | "trips">, budget: BudgetMonth, byMonth: Map<string, Tx[]>) {
  const lineIds = new Set(budget.lines.map((l) => l.categoryId));
  const spentBy = new Map<string, number>();
  const rate = budgetRate(budget, model.currency, latestBudgetRate(model));
  let budgeted = 0;
  let unbudgeted = 0;
  let unconverted = 0;
  const byAlbum = new Map<string, number>();
  for (const tx of byMonth.get(budget.month) ?? []) {
    // As in the app, a budget is made of top-level lines: spending counts as
    // budgeted when its top-level category has a line. The app knows only
    // live categories, so spending on a deleted one (a subcategory too) is
    // its own root with no line: unbudgeted.
    const category = tx.categoryId ? model.categories.get(tx.categoryId) : undefined;
    const live = category && !category.deleted ? category : null;
    const root = live ? (live.parentId ?? live.id) : null;
    // A counted transfer's size is its amount, whatever its sign as stored.
    const original = tx.type === "transfer" ? Math.abs(tx.originalAmount) : tx.originalAmount;
    const value = budgetSpendValue({ amount: tx.amount, original, currency: tx.currency }, budget.currency, rate);
    if (value === null) {
      // Only spending that would count toward this budget is worth a mention.
      if (tx.albumId || (root && lineIds.has(root)) || budget.countUnbudgeted) unconverted += 1;
      continue;
    }
    if (tx.albumId) {
      byAlbum.set(tx.albumId, (byAlbum.get(tx.albumId) ?? 0) + value);
      continue;
    }
    if (root && lineIds.has(root)) budgeted += value;
    else unbudgeted += value;
    if (live) spentBy.set(live.id, (spentBy.get(live.id) ?? 0) + value);
  }
  const lines = budget.lines.map((line) => {
    const category = model.categories.get(line.categoryId)!;
    // A line on a top-level category rolls up its subcategories.
    const spent = category.parentId
      ? (spentBy.get(category.id) ?? 0)
      : (spentBy.get(category.id) ?? 0) + category.children.reduce((s, id) => s + (spentBy.get(id) ?? 0), 0);
    return { category, amount: line.amount, spent, remaining: line.amount - spent, ratio: line.amount ? spent / line.amount : 0 };
  });
  const tripById = new Map(model.trips.map((trip) => [trip.id, trip]));
  const albums = [...byAlbum]
    .flatMap(([id, spent]) => {
      const trip = tripById.get(id);
      return trip ? [{ trip, spent }] : [];
    })
    .sort((a, b) => b.spent - a.spent);
  const albumSpent = albums.reduce((sum, album) => sum + album.spent, 0);
  const totalSpent = budgeted + albumSpent + (budget.countUnbudgeted ? unbudgeted : 0);
  return { lines, totalSpent, unbudgeted, albums, albumSpent, total: budget.total, rate, unconverted };
}

