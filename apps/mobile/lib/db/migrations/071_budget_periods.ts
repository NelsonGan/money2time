import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// Budgets can repeat weekly, monthly or yearly instead of only monthly.
// - budget_templates.period: how often a budget made from the template repeats.
// - monthly_budgets.period: the period a budget row covers. The table keeps its
//   name, and its `month` column holds the period's key: 'YYYY-MM-DD' (the
//   week's first day) for a week, 'YYYY-MM' for a month, 'YYYY' for a year.
// Every existing row is a monthly one, which the column default records.
// The one-live-budget-per-month index becomes one per period and key.
export const migration071BudgetPeriods: DbMigration = {
  version: 71,
  name: '071_budget_periods',
  up(db) {
    addColumnIfMissing(db, 'budget_templates', 'period', "TEXT NOT NULL DEFAULT 'month'");
    addColumnIfMissing(db, 'monthly_budgets', 'period', "TEXT NOT NULL DEFAULT 'month'");
    db.execSync(`
      DROP INDEX IF EXISTS idx_monthly_budgets_month;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_budgets_period_key
        ON monthly_budgets(period, month)
        WHERE deleted_at IS NULL;
    `);
  },
};

export default migration071BudgetPeriods;
