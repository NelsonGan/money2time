import type { BackupData } from '~/services/dataManagementService';

/** A row's budget period; rows from before periods existed are monthly. */
function isMonthly(row: Record<string, unknown>): boolean {
  return row.period == null || row.period === 'month';
}

/**
 * The data as the Web Dashboard is sent it: the web app knows monthly budgets
 * only, and would read a week's or a year's key as a month. So it gets the
 * monthly templates and month budgets alone, with their lines; weekly and
 * yearly ones stay on the phone (and in backups) until the web learns them.
 */
export function webDashboardBudgetsOnly(data: BackupData): BackupData {
  const { tables } = data;
  const templates = tables.budget_templates;
  const budgets = tables.monthly_budgets;
  if (!templates?.some((row) => !isMonthly(row)) && !budgets?.some((row) => !isMonthly(row))) {
    return data;
  }
  const keptTemplates = (templates ?? []).filter(isMonthly);
  const keptBudgets = (budgets ?? []).filter(isMonthly);
  const templateIds = new Set(keptTemplates.map((row) => row.id));
  const budgetIds = new Set(keptBudgets.map((row) => row.id));
  return {
    ...data,
    tables: {
      ...tables,
      budget_templates: keptTemplates,
      budget_template_categories: (tables.budget_template_categories ?? []).filter((row) =>
        templateIds.has(row.template_id),
      ),
      monthly_budgets: keptBudgets,
      monthly_budget_categories: (tables.monthly_budget_categories ?? []).filter((row) =>
        budgetIds.has(row.budget_id),
      ),
    },
  };
}
