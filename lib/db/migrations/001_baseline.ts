import type { DbMigration } from './types';

const BASELINE_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    account_group TEXT,
    credit_statement_day INTEGER,
    credit_due_day INTEGER,
    currency TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    starting_balance REAL NOT NULL DEFAULT 0,
    include_in_totals INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS account_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    parent_id TEXT,
    icon TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    date TEXT NOT NULL,
    account_id TEXT,
    from_account_id TEXT,
    to_account_id TEXT,
    category_id TEXT,
    note TEXT,
    recurrence_pattern TEXT NOT NULL DEFAULT 'none',
    recurrence_interval INTEGER NOT NULL DEFAULT 1,
    recurrence_end_date TEXT,
    recurrence_parent_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS recurring_rules (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    account_id TEXT,
    from_account_id TEXT,
    to_account_id TEXT,
    category_id TEXT,
    note TEXT,
    recurrence_pattern TEXT NOT NULL,
    recurrence_interval INTEGER NOT NULL DEFAULT 1,
    next_run_date TEXT NOT NULL,
    end_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    currency_symbol TEXT NOT NULL DEFAULT '$',
    hour_rounding REAL NOT NULL DEFAULT 0.1,
    display_mode TEXT NOT NULL DEFAULT 'money',
    theme_mode TEXT NOT NULL DEFAULT 'system',
    insights_prefs_json TEXT,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    user_mode TEXT NOT NULL DEFAULT 'power',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS monthly_wage_settings (
    id TEXT PRIMARY KEY NOT NULL,
    month TEXT NOT NULL,
    wage_type TEXT NOT NULL,
    wage_amount REAL NOT NULL,
    hours_worked_per_week REAL NOT NULL,
    workdays_per_week INTEGER NOT NULL,
    commute_minutes_per_workday INTEGER NOT NULL,
    base_hourly_rate REAL NOT NULL,
    true_hourly_rate REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_from_account_id ON transactions(from_account_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id ON transactions(to_account_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
  CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_wage_month_unique
    ON monthly_wage_settings(month)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_monthly_wage_month ON monthly_wage_settings(month);

  CREATE INDEX IF NOT EXISTS idx_transactions_active_date_desc
    ON transactions(date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_type_date_desc
    ON transactions(type, date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_account_date_desc
    ON transactions(account_id, date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_from_account_date_desc
    ON transactions(from_account_id, date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_to_account_date_desc
    ON transactions(to_account_id, date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_category_date_desc
    ON transactions(category_id, date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_accounts_active_sort_name
    ON accounts(sort_order, name)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_categories_active_type_sort_name
    ON categories(type, sort_order, name)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_account_groups_active_sort_name
    ON account_groups(sort_order, name)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_recurrence_parent
    ON transactions(recurrence_parent_id)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transactions_active_recurrence_pattern
    ON transactions(recurrence_pattern, date DESC)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next_run
    ON recurring_rules(next_run_date)
    WHERE deleted_at IS NULL AND is_active = 1;
`;

export const migration001Baseline: DbMigration = {
  version: 1,
  name: '001_baseline',
  up(db) {
    db.execSync(BASELINE_SQL);
  },
};

export default migration001Baseline;
