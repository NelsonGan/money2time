import type { BackupData } from '~/services/dataManagementService';

/**
 * Whether the Web Dashboard can show a budget row: a monthly one (rows from
 * before periods existed are monthly), and, for a page that cannot show
 * budget currencies, one in the ledger's main currency (rows from before
 * budgets had currencies have none).
 */
function isWebBudget(row: Record<string, unknown>, currencies: boolean): boolean {
  return (row.period == null || row.period === 'month') && (currencies || row.currency == null);
}

/**
 * The data as the Web Dashboard is sent it: the web app knows monthly budgets
 * only, and would read a week's or a year's key as a month. So it gets the
 * monthly templates and month budgets alone, with their lines; weekly and
 * yearly ones stay on the phone (and in backups) until the web learns them.
 * A page that does not say it can show budget currencies (`currencies`, its
 * `budget-currencies` want feature) is sent main-currency ones only, as it
 * would read a JPY budget's amounts as the main currency's.
 */
export function webDashboardBudgetsOnly(
  data: BackupData,
  { currencies = false }: { currencies?: boolean } = {},
): BackupData {
  const { tables } = data;
  const templates = tables.budget_templates;
  const budgets = tables.monthly_budgets;
  const isWeb = (row: Record<string, unknown>) => isWebBudget(row, currencies);
  if (!templates?.some((row) => !isWeb(row)) && !budgets?.some((row) => !isWeb(row))) {
    return data;
  }
  const keptTemplates = (templates ?? []).filter(isWeb);
  const keptBudgets = (budgets ?? []).filter(isWeb);
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
