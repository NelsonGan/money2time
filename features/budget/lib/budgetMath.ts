import type {
  BudgetCategoryProgress,
  BudgetMonthSummary,
  BudgetTemplate,
  Category,
  MonthCycleInput,
  MonthlyBudget,
  TransactionWithRelations,
  UnbudgetedCategorySpend,
} from '~/types';
import { financialMonthKeyForDate, financialMonthKeyForIso } from '~/utils/financialMonth';
import {
  addMonthsAtMonthStart,
  monthKeyFromDateLocal,
  normalizeMoneyAmount,
  parseMonthKey,
} from '~/utils/formatters';

/**
 * Aggregates one month's expense spend against its (possibly absent) budget.
 * Spend is valued at the frozen reporting-currency amount so budget numbers
 * always agree with Insights.
 *
 * Lines on root categories are the primary rows; their spend rolls all
 * subcategory activity up. Lines on subcategories render as children of their
 * root line with that category's own spend (no roll-up). Whether unbudgeted
 * spend counts toward the month total follows the frozen `countUnbudgeted`
 * flag. Returns null when there is no budget for the month.
 */
export function buildBudgetMonthSummary({
  month,
  budget,
  transactions,
  categories,
  monthCycle = 1,
}: {
  month: string;
  budget: MonthlyBudget | null;
  transactions: TransactionWithRelations[];
  categories: Pick<Category, 'id' | 'parentId'>[];
  monthCycle?: MonthCycleInput;
}): BudgetMonthSummary | null {
  if (!budget) return null;

  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  const rootById = new Map(
    categories.map((category) => [category.id, category.parentId ?? category.id]),
  );
  const knownCategoryIds = new Set(categories.map((category) => category.id));

  // Drop lines whose category no longer resolves (defensive on top of the
  // delete cascade) so a stale line can't render a ghost row.
  const lines = budget.lines.filter((line) => knownCategoryIds.has(line.categoryId));
  const rootLines = lines.filter((line) => !parentById.get(line.categoryId));
  const rootLineIds = new Set(rootLines.map((line) => line.categoryId));
  // Child lines only make sense under a budgeted root; orphans are dropped
  // (their spend still counts via the parent roll-up / unbudgeted bucket).
  const childLinesByRoot = new Map<string, typeof lines>();
  for (const line of lines) {
    const parentId = parentById.get(line.categoryId);
    if (!parentId || !rootLineIds.has(parentId)) continue;
    const list = childLinesByRoot.get(parentId) ?? [];
    list.push(line);
    childLinesByRoot.set(parentId, list);
  }

  const spentByRoot = new Map<string, number>();
  const spentByCategory = new Map<string, number>();
  let uncategorizedSpent = 0;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    if (financialMonthKeyForIso(transaction.date, monthCycle) !== month) continue;
    const value = transaction.reportingAmount ?? transaction.amount;
    const categoryId = transaction.categoryId;
    if (!categoryId) {
      uncategorizedSpent += value;
      continue;
    }
    const rootId = rootById.get(categoryId) ?? categoryId;
    spentByRoot.set(rootId, (spentByRoot.get(rootId) ?? 0) + value);
    spentByCategory.set(categoryId, (spentByCategory.get(categoryId) ?? 0) + value);
  }

  const toProgress = (
    categoryId: string,
    amount: number,
    spent: number,
    children: BudgetCategoryProgress[],
  ): BudgetCategoryProgress => {
    const budgeted = normalizeMoneyAmount(amount);
    const normalizedSpent = normalizeMoneyAmount(spent);
    const remaining = normalizeMoneyAmount(budgeted - normalizedSpent);
    return {
      categoryId,
      budgeted,
      spent: normalizedSpent,
      remaining,
      usageRatio: budgeted > 0 ? normalizedSpent / budgeted : 0,
      isOver: remaining < 0,
      children,
    };
  };

  let budgetedSpent = 0;
  const progress: BudgetCategoryProgress[] = rootLines.map((line) => {
    const spent = spentByRoot.get(line.categoryId) ?? 0;
    budgetedSpent += normalizeMoneyAmount(spent);
    const children = (childLinesByRoot.get(line.categoryId) ?? []).map((childLine) =>
      toProgress(
        childLine.categoryId,
        childLine.amount,
        spentByCategory.get(childLine.categoryId) ?? 0,
        [],
      ),
    );
    return toProgress(line.categoryId, line.amount, spent, children);
  });

  const unbudgeted: UnbudgetedCategorySpend[] = [];
  let unbudgetedSpent = uncategorizedSpent;
  for (const [rootId, spent] of spentByRoot) {
    if (rootLineIds.has(rootId)) continue;
    unbudgetedSpent += spent;
    unbudgeted.push({ categoryId: rootId, spent: normalizeMoneyAmount(spent) });
  }
  if (uncategorizedSpent > 0) {
    unbudgeted.push({ categoryId: null, spent: normalizeMoneyAmount(uncategorizedSpent) });
  }
  unbudgeted.sort((a, b) => b.spent - a.spent);

  budgetedSpent = normalizeMoneyAmount(budgetedSpent);
  unbudgetedSpent = normalizeMoneyAmount(unbudgetedSpent);
  const countUnbudgeted = budget.countUnbudgeted;
  const totalBudget = normalizeMoneyAmount(budget.totalAmount);
  const totalSpent = normalizeMoneyAmount(budgetedSpent + (countUnbudgeted ? unbudgetedSpent : 0));
  const remaining = normalizeMoneyAmount(totalBudget - totalSpent);

  return {
    month,
    totalBudget,
    totalSpent,
    budgetedSpent,
    unbudgetedSpent,
    countUnbudgeted,
    remaining,
    exceededBy: remaining < 0 ? Math.abs(remaining) : 0,
    usageRatio: totalBudget > 0 ? totalSpent / totalBudget : 0,
    categories: progress,
    unbudgeted,
  };
}

/**
 * Editor helper: how far a parent's subcategory allocations are from the
 * parent amount. Zero when no child is allocated (children are optional) or
 * when they sum exactly to the parent; positive = still unassigned, negative
 * = over-assigned. Save must be blocked while any parent is non-zero.
 */
export function computeChildAllocationGap(
  parentAmount: number,
  childAllocations: { amount: number }[],
): number {
  const allocated = childAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (allocated === 0) return 0;
  return normalizeMoneyAmount(parentAmount - allocated);
}

export interface BackPopulateRange {
  /** Missing past months ('YYYY-MM', ascending) a back-populate would fill. */
  months: string[];
  firstMonthKey: string;
  lastMonthKey: string;
}

function addMonthsToKey(monthKey: string, offset: number): string {
  return monthKeyFromDateLocal(
    addMonthsAtMonthStart(parseMonthKey(monthKey) ?? new Date(), offset),
  );
}

/**
 * Past months a back-populate would create budgets for: from the month of the
 * earliest live expense transaction through last month, skipping months that
 * have or ever had a budget (deletion tombstones stick, same as auto-create,
 * so a bulk fill can't resurrect a deliberately deleted month). Returns null
 * when there is nothing to fill (no expense history, or the first expense is
 * in the current month).
 */
export function computeBackPopulateRange({
  transactions,
  existingMonths,
  now = new Date(),
  monthCycle = 1,
}: {
  transactions: TransactionWithRelations[];
  /** Months that have or ever had a budget, soft-deleted included. */
  existingMonths: string[];
  now?: Date;
  monthCycle?: MonthCycleInput;
}): BackPopulateRange | null {
  let firstExpenseMonth: string | null = null;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    const monthKey = financialMonthKeyForIso(transaction.date, monthCycle);
    if (!firstExpenseMonth || monthKey < firstExpenseMonth) firstExpenseMonth = monthKey;
  }
  if (!firstExpenseMonth) return null;

  const currentMonth = financialMonthKeyForDate(now, monthCycle);
  if (firstExpenseMonth >= currentMonth) return null;

  const taken = new Set(existingMonths);
  const months: string[] = [];
  for (let month = firstExpenseMonth; month < currentMonth; month = addMonthsToKey(month, 1)) {
    if (!taken.has(month)) months.push(month);
  }
  if (months.length === 0) return null;

  return {
    months,
    firstMonthKey: months[0],
    lastMonthKey: months[months.length - 1],
  };
}

/**
 * Month-rollover auto-create decision: returns the template to create the
 * current month's budget from, or null to skip. Skips when the month has or
 * ever had a budget (deletion tombstones stick) or no templates exist.
 */
export function pickAutoCreateTemplate({
  currentMonthHasEverHadBudget,
  templates,
}: {
  currentMonthHasEverHadBudget: boolean;
  templates: BudgetTemplate[];
}): BudgetTemplate | null {
  if (currentMonthHasEverHadBudget) return null;
  if (templates.length === 0) return null;
  return templates.find((template) => template.isDefault) ?? templates[0];
}

/**
 * Number of root-category allocations. A template's stored allocations also
 * include subcategory breakdown rows, which are a split *within* their parent
 * — display counts must not include them.
 */
export function countRootAllocations(
  allocations: { categoryId: string }[],
  categories: Pick<Category, 'id' | 'parentId'>[],
): number {
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  return allocations.filter((allocation) => !parentById.get(allocation.categoryId)).length;
}

/**
 * Editor helper: how much of the total is still unallocated (positive), fully
 * allocated (zero), or over-allocated (negative). Normalized so float dust
 * can't keep a fully-allocated template from saving.
 */
export function computeAllocationRemaining(
  totalAmount: number,
  allocations: { amount: number }[],
): number {
  const allocated = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  return normalizeMoneyAmount(totalAmount - allocated);
}

/** How far past the current month the pager reaches, so future months can be
 *  planned well ahead. */
export const BUDGET_PAGER_FUTURE_MONTHS = 12;

/**
 * Months shown by the budget pager: earliest budget/expense month through a
 * year ahead (or the latest existing budget, whichever is further).
 */
export function computeBudgetPagerMonths({
  budgets,
  transactions,
  now = new Date(),
  monthCycle = 1,
}: {
  budgets: MonthlyBudget[];
  transactions: TransactionWithRelations[];
  now?: Date;
  monthCycle?: MonthCycleInput;
}): string[] {
  const currentMonth = financialMonthKeyForDate(now, monthCycle);
  let firstMonth = currentMonth;
  let lastMonth = addMonthsToKey(currentMonth, BUDGET_PAGER_FUTURE_MONTHS);
  for (const budget of budgets) {
    if (budget.month < firstMonth) firstMonth = budget.month;
    if (budget.month > lastMonth) lastMonth = budget.month;
  }
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    const monthKey = financialMonthKeyForIso(transaction.date, monthCycle);
    if (monthKey < firstMonth) firstMonth = monthKey;
  }

  const months: string[] = [];
  for (let month = firstMonth; month <= lastMonth; month = addMonthsToKey(month, 1)) {
    months.push(month);
  }
  return months;
}
