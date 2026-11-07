import type { BackupData } from '~/services/dataManagementService';

/**
 * Whether the Web Dashboard can show a budget row: a monthly one (rows from
 * before periods existed are monthly) in the ledger's main currency (rows from
 * before budgets had currencies have none).
 */
function isWebBudget(row: Record<string, unknown>): boolean {
  return (row.period == null || row.period === 'month') && row.currency == null;
}

/**
 * The data as the Web Dashboard is sent it: the web app knows monthly budgets
 * in the main currency only, and would read a week's or a year's key as a
 * month and a JPY budget's amounts as the main currency's. So it gets those
 * templates and month budgets alone, with their lines; the others stay on the
 * phone (and in backups) until the web learns them.
 */
export function webDashboardBudgetsOnly(data: BackupData): BackupData {
  const { tables } = data;
  const templates = tables.budget_templates;
  const budgets = tables.monthly_budgets;
  if (!templates?.some((row) => !isWebBudget(row)) && !budgets?.some((row) => !isWebBudget(row))) {
    return data;
  }
  const keptTemplates = (templates ?? []).filter(isWebBudget);
  const keptBudgets = (budgets ?? []).filter(isWebBudget);
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
