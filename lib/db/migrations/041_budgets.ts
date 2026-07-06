import type { DbMigration } from './types';

const BUDGETS_SQL = `
  CREATE TABLE IF NOT EXISTS budget_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS budget_template_categories (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_budget_template_categories_template
    ON budget_template_categories(template_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS monthly_budgets (
    id TEXT PRIMARY KEY NOT NULL,
    month TEXT NOT NULL,
    template_id TEXT,
    template_name TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_budgets_month
    ON monthly_budgets(month)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS monthly_budget_categories (
    id TEXT PRIMARY KEY NOT NULL,
    budget_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_monthly_budget_categories_budget
    ON monthly_budget_categories(budget_id)
    WHERE deleted_at IS NULL;
`;

export const migration041Budgets: DbMigration = {
  version: 41,
  name: '041_budgets',
  up(db) {
    db.execSync(BUDGETS_SQL);
  },
};

export default migration041Budgets;
