/**
 * The app keeps weekly, monthly and yearly budgets in the same tables
 * (`budget_templates.period`, `monthly_budgets.period`: "week" | "month" |
 * "year", missing on rows written before periods existed, which are monthly).
 * The dashboard only understands monthly budgets, so every reader keeps the
 * monthly rows and drops the rest. The phone already sends a live session
 * monthly rows only; this covers a backup uploaded straight to the site.
 */
export type BudgetPeriod = "week" | "month" | "year";

/** Whether a template or budget row is a monthly one. */
export function isMonthlyBudget(row: { period?: string | null }): boolean {
  return row.period === undefined || row.period === null || row.period === "month";
}

/** Only the monthly template or budget rows. */
export function monthlyBudgetRows<T extends { period?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter(isMonthlyBudget);
}
