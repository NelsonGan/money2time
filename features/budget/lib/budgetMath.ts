import type {
  BudgetCategoryProgress,
  BudgetMonthSummary,
  BudgetTemplate,
  Category,
  MonthlyBudget,
  TransactionWithRelations,
  UnbudgetedCategorySpend,
} from '~/types';
import {
  addMonthsAtMonthStart,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
  normalizeMoneyAmount,
  startOfMonthDate,
} from '~/utils/formatters';

/**
 * Aggregates one month's expense spend against its (possibly absent) budget.
 * Spend is valued at the frozen reporting-currency amount so budget numbers
 * always agree with Insights. Subcategory spend rolls up to its root category.
 * Returns null when there is no budget for the month.
 */
export function buildBudgetMonthSummary({
  month,
  budget,
  transactions,
  categories,
}: {
  month: string;
  budget: MonthlyBudget | null;
  transactions: TransactionWithRelations[];
  categories: Pick<Category, 'id' | 'parentId'>[];
}): BudgetMonthSummary | null {
  if (!budget) return null;

  const rootById = new Map(
    categories.map((category) => [category.id, category.parentId ?? category.id]),
  );
  const knownCategoryIds = new Set(categories.map((category) => category.id));

  // Drop lines whose category no longer resolves (defensive on top of the
  // delete cascade) so a stale line can't render a ghost row.
  const lines = budget.lines.filter((line) => knownCategoryIds.has(line.categoryId));
  const budgetedByCategory = new Map(lines.map((line) => [line.categoryId, line.amount]));

  const spentByRoot = new Map<string, number>();
  let uncategorizedSpent = 0;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    if (monthKeyFromIsoLocal(transaction.date) !== month) continue;
    const value = transaction.reportingAmount ?? transaction.amount;
    const categoryId = transaction.categoryId;
    if (!categoryId) {
      uncategorizedSpent += value;
      continue;
    }
    const rootId = rootById.get(categoryId) ?? categoryId;
    spentByRoot.set(rootId, (spentByRoot.get(rootId) ?? 0) + value);
  }

  let budgetedSpent = 0;
  const progress: BudgetCategoryProgress[] = lines.map((line) => {
    const spent = normalizeMoneyAmount(spentByRoot.get(line.categoryId) ?? 0);
    budgetedSpent += spent;
    const budgeted = normalizeMoneyAmount(line.amount);
    const remaining = normalizeMoneyAmount(budgeted - spent);
    return {
      categoryId: line.categoryId,
      budgeted,
      spent,
      remaining,
      usageRatio: budgeted > 0 ? spent / budgeted : 0,
      isOver: remaining < 0,
    };
  });

  const unbudgeted: UnbudgetedCategorySpend[] = [];
  let unbudgetedSpent = uncategorizedSpent;
  for (const [rootId, spent] of spentByRoot) {
    if (budgetedByCategory.has(rootId)) continue;
    unbudgetedSpent += spent;
    unbudgeted.push({ categoryId: rootId, spent: normalizeMoneyAmount(spent) });
  }
  if (uncategorizedSpent > 0) {
    unbudgeted.push({ categoryId: null, spent: normalizeMoneyAmount(uncategorizedSpent) });
  }
  unbudgeted.sort((a, b) => b.spent - a.spent);

  budgetedSpent = normalizeMoneyAmount(budgetedSpent);
  unbudgetedSpent = normalizeMoneyAmount(unbudgetedSpent);
  const totalBudget = normalizeMoneyAmount(budget.totalAmount);
  const totalSpent = normalizeMoneyAmount(budgetedSpent + unbudgetedSpent);
  const remaining = normalizeMoneyAmount(totalBudget - totalSpent);

  return {
    month,
    totalBudget,
    totalSpent,
    budgetedSpent,
    unbudgetedSpent,
    remaining,
    exceededBy: remaining < 0 ? Math.abs(remaining) : 0,
    usageRatio: totalBudget > 0 ? totalSpent / totalBudget : 0,
    categories: progress,
    unbudgeted,
  };
}

export interface BackPopulateRange {
  /** Missing past months ('YYYY-MM', ascending) a back-populate would fill. */
  months: string[];
  firstMonthKey: string;
  lastMonthKey: string;
}

function addMonthsToKey(monthKey: string, offset: number): string {
  const year = Number(monthKey.slice(0, 4));
  const monthIndex = Number(monthKey.slice(5, 7)) - 1;
  return monthKeyFromDateLocal(addMonthsAtMonthStart(new Date(year, monthIndex, 1), offset));
}

/**
 * Past months a back-populate would create budgets for: from the month of the
 * earliest live expense transaction through last month, skipping months that
 * already have a live budget. Returns null when there is nothing to fill
 * (no expense history, or the first expense is in the current month).
 */
export function computeBackPopulateRange({
  transactions,
  existingLiveMonths,
  now = new Date(),
}: {
  transactions: TransactionWithRelations[];
  existingLiveMonths: string[];
  now?: Date;
}): BackPopulateRange | null {
  let firstExpenseMonth: string | null = null;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    const monthKey = monthKeyFromIsoLocal(transaction.date);
    if (!firstExpenseMonth || monthKey < firstExpenseMonth) firstExpenseMonth = monthKey;
  }
  if (!firstExpenseMonth) return null;

  const currentMonth = monthKeyFromDateLocal(startOfMonthDate(now));
  if (firstExpenseMonth >= currentMonth) return null;

  const taken = new Set(existingLiveMonths);
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

/** Months shown by the budget pager: earliest budget/expense month → current + 1. */
export function computeBudgetPagerMonths({
  budgets,
  transactions,
  now = new Date(),
}: {
  budgets: MonthlyBudget[];
  transactions: TransactionWithRelations[];
  now?: Date;
}): string[] {
  const currentMonth = monthKeyFromDateLocal(startOfMonthDate(now));
  let firstMonth = currentMonth;
  for (const budget of budgets) {
    if (budget.month < firstMonth) firstMonth = budget.month;
  }
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    const monthKey = monthKeyFromIsoLocal(transaction.date);
    if (monthKey < firstMonth) firstMonth = monthKey;
  }

  const lastMonth = addMonthsToKey(currentMonth, 1);
  const months: string[] = [];
  for (let month = firstMonth; month <= lastMonth; month = addMonthsToKey(month, 1)) {
    months.push(month);
  }
  return months;
}
