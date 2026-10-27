import type {
  BudgetCategoryProgress,
  BudgetPeriod,
  BudgetSummary,
  BudgetTemplate,
  Category,
  MonthCycleInput,
  PeriodBudget,
  TransactionWithRelations,
  UnbudgetedCategorySpend,
} from '~/types';
import { dateFromDayKeyLocal, dayKeyFromIsoLocal, normalizeMoneyAmount } from '~/utils/formatters';

import {
  addBudgetPeriods,
  type BudgetPeriodClock,
  budgetPeriodKeyForDate,
  budgetPeriodRange,
  budgetSlotKey,
  budgetWeekOverlaps,
  isIsoInBudgetRange,
} from './budgetPeriods';

/**
 * Aggregates one period's expense spend against its budget. Spend is valued
 * at the frozen reporting-currency amount so budget numbers always agree with
 * Insights, and only transactions inside the budget's own period count.
 *
 * Lines on root categories are the primary rows; their spend rolls all
 * subcategory activity up. Lines on subcategories render as children of their
 * root line with that category's own spend (no roll-up). Whether unbudgeted
 * spend counts toward the period total follows the frozen `countUnbudgeted`
 * flag. Returns null when there is no budget.
 */
export function buildBudgetSummary({
  budget,
  transactions,
  categories,
  monthCycle = 1,
}: {
  budget: PeriodBudget | null;
  transactions: TransactionWithRelations[];
  categories: Pick<Category, 'id' | 'parentId'>[];
  monthCycle?: MonthCycleInput;
}): BudgetSummary | null {
  if (!budget) return null;
  const range = budgetPeriodRange(budget.period, budget.periodKey, monthCycle);

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
    if (!isIsoInBudgetRange(transaction.date, range)) continue;
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
 * = over-assigned. A partial breakdown is fine (the rest stays on the parent
 * line); Save is blocked only while a parent is over-assigned (negative).
 */
export function computeChildAllocationGap(
  parentAmount: number,
  childAllocations: { amount: number }[],
): number {
  const allocated = childAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (allocated === 0) return 0;
  return normalizeMoneyAmount(parentAmount - allocated);
}

/**
 * Whether a parent's subcategory breakdown blocks Save: only when the children
 * claim more than the parent. Splitting part of the parent is fine; the
 * unassigned rest simply stays on the parent line.
 */
export function childAllocationExceedsParent(
  parentAmount: number,
  childAllocations: { amount: number }[],
): boolean {
  return computeChildAllocationGap(parentAmount, childAllocations) < 0;
}

export interface BackPopulateRange {
  /** Missing past period keys (ascending) a back-populate would fill. */
  keys: string[];
  firstKey: string;
  lastKey: string;
}

/** Key of the period the earliest live expense falls in, or null without expenses. */
function firstExpenseKey(
  period: BudgetPeriod,
  transactions: Pick<TransactionWithRelations, 'type' | 'date' | 'deletedAt'>[],
  clock: BudgetPeriodClock,
): string | null {
  let firstDay: string | null = null;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    const dayKey = dayKeyFromIsoLocal(transaction.date);
    if (!firstDay || dayKey < firstDay) firstDay = dayKey;
  }
  return firstDay ? budgetPeriodKeyForDate(period, dateFromDayKeyLocal(firstDay), clock) : null;
}

/**
 * Past periods a back-populate would create budgets for: from the period of
 * the earliest live expense transaction through the last completed one,
 * skipping periods that have or ever had a budget (deletion tombstones stick,
 * same as auto-create, so a bulk fill can't resurrect a deliberately deleted
 * period). Returns null when there is nothing to fill (no expense history, or
 * the first expense is in the current period).
 */
export function computeBackPopulateRange({
  period,
  transactions,
  existingKeys,
  now = new Date(),
  clock,
}: {
  period: BudgetPeriod;
  transactions: Pick<TransactionWithRelations, 'type' | 'date' | 'deletedAt'>[];
  /** Keys of this period that have or ever had a budget, soft-deleted included. */
  existingKeys: string[];
  now?: Date;
  clock: BudgetPeriodClock;
}): BackPopulateRange | null {
  const firstKey = firstExpenseKey(period, transactions, clock);
  if (!firstKey) return null;

  const currentKey = budgetPeriodKeyForDate(period, now, clock);
  if (firstKey >= currentKey) return null;

  // A week made under another first day of the week blocks every week it
  // shares a day with.
  const taken = new Set(existingKeys);
  const isTaken = (key: string) =>
    period === 'week' ? budgetWeekOverlaps(key, existingKeys) : taken.has(key);
  const keys: string[] = [];
  for (
    let key = firstKey;
    key < currentKey;
    key = addBudgetPeriods(period, key, 1, clock.monthCycle)
  ) {
    if (!isTaken(key)) keys.push(key);
  }
  if (keys.length === 0) return null;

  return { keys, firstKey: keys[0], lastKey: keys[keys.length - 1] };
}

/**
 * Period-rollover auto-create decision: returns the template of `period` to
 * create the current period's budget from, or null to skip. Skips when the
 * period has or ever had a budget (deletion tombstones stick) or the period
 * has no templates.
 */
export function pickAutoCreateTemplate({
  period,
  currentPeriodHasEverHadBudget,
  templates,
}: {
  period: BudgetPeriod;
  currentPeriodHasEverHadBudget: boolean;
  templates: BudgetTemplate[];
}): BudgetTemplate | null {
  if (currentPeriodHasEverHadBudget) return null;
  const ofPeriod = templates.filter((template) => template.period === period);
  if (ofPeriod.length === 0) return null;
  return ofPeriod.find((template) => template.isDefault) ?? ofPeriod[0];
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

/** How far past the current month the pager reaches, so budgets can be
 *  planned well ahead. */
export const BUDGET_PAGER_FUTURE_MONTHS = 12;

/**
 * Months shown by the budget pager: from the month of the earliest budget
 * (of any period) or expense to a year ahead, or to the latest budget's
 * month when that is further.
 */
export function computeBudgetPagerMonths({
  budgets,
  transactions,
  now = new Date(),
  clock,
}: {
  budgets: PeriodBudget[];
  /** Only each row's type, date and deletion are read. */
  transactions: Pick<TransactionWithRelations, 'type' | 'date' | 'deletedAt'>[];
  now?: Date;
  clock: BudgetPeriodClock;
}): string[] {
  const { monthCycle } = clock;
  const monthOfDay = (dayKey: string) =>
    budgetPeriodKeyForDate('month', dateFromDayKeyLocal(dayKey), clock);
  const currentKey = budgetPeriodKeyForDate('month', now, clock);
  let firstKey = currentKey;
  let lastKey = addBudgetPeriods('month', currentKey, BUDGET_PAGER_FUTURE_MONTHS, monthCycle);
  for (const budget of budgets) {
    const range = budgetPeriodRange(budget.period, budget.periodKey, monthCycle);
    const first = monthOfDay(range.start);
    // A year budget reaches the pager's end only through its first month, so
    // planning next year does not stretch the pager to next December.
    const last = budget.period === 'year' ? first : monthOfDay(range.end);
    if (first < firstKey) firstKey = first;
    if (last > lastKey) lastKey = last;
  }
  const expenseKey = firstExpenseKey('month', transactions, clock);
  if (expenseKey && expenseKey < firstKey) firstKey = expenseKey;

  const keys: string[] = [];
  for (let key = firstKey; key <= lastKey; key = addBudgetPeriods('month', key, 1, monthCycle)) {
    keys.push(key);
  }
  return keys;
}

/** What one month's page of the budget pager holds. */
export interface BudgetMonthPage {
  /** The month's own budget. */
  month: PeriodBudget | null;
  /**
   * Every week (laid out with the current first day of the week) with a day
   * in the month, oldest first, with its budget. A week budget made under
   * another first day of the week sits on the week its first day falls in;
   * should two land on one week, the one keyed on it wins, else the later.
   */
  weeks: { key: string; budget: PeriodBudget | null }[];
  /** The calendar year the month's key belongs to, and its budget. */
  yearKey: string;
  year: PeriodBudget | null;
}

export function buildBudgetMonthPage({
  monthKey,
  budgets,
  clock,
}: {
  monthKey: string;
  budgets: PeriodBudget[];
  clock: BudgetPeriodClock;
}): BudgetMonthPage {
  const { monthCycle, weekStartsOn } = clock;
  const range = budgetPeriodRange('month', monthKey, monthCycle);
  const yearKey = monthKey.slice(0, 4);

  const weekBySlot = new Map<string, PeriodBudget>();
  let month: PeriodBudget | null = null;
  let year: PeriodBudget | null = null;
  for (const budget of budgets) {
    if (budget.deletedAt) continue;
    if (budget.period === 'month') {
      if (budget.periodKey === monthKey) month = budget;
    } else if (budget.period === 'year') {
      if (budget.periodKey === yearKey) year = budget;
    } else {
      const slot = budgetSlotKey('week', budget.periodKey, weekStartsOn);
      const taken = weekBySlot.get(slot);
      if (taken && (taken.periodKey === slot || taken.periodKey > budget.periodKey)) continue;
      weekBySlot.set(slot, budget);
    }
  }

  const weeks: BudgetMonthPage['weeks'] = [];
  for (
    let key = budgetPeriodKeyForDate('week', dateFromDayKeyLocal(range.start), clock);
    key <= range.end;
    key = addBudgetPeriods('week', key, 1, monthCycle)
  ) {
    weeks.push({ key, budget: weekBySlot.get(key) ?? null });
  }

  return { month, weeks, yearKey, year };
}
