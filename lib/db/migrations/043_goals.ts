import type { DbMigration } from './types';

const GOALS_SQL = `
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    -- Frozen goal-currency -> reporting-currency snapshot, captured at creation
    -- so target vs saved always compare in the same (reporting) space and never
    -- drift when rates move. For goals in the reporting currency, fx_rate = 1.
    fx_rate REAL NOT NULL DEFAULT 1,
    target_reporting_amount REAL NOT NULL DEFAULT 0,
    starting_amount REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    cover_photo_uri TEXT,
    emoji TEXT,
    note TEXT,
    -- 'manual' = own contribution ledger; 'account' = mirrors a linked account.
    tracking_mode TEXT NOT NULL DEFAULT 'manual',
    linked_account_id TEXT,
    count_existing_balance INTEGER NOT NULL DEFAULT 0,
    baseline_amount REAL,
    -- 'active' | 'completed' | 'archived'.
    status TEXT NOT NULL DEFAULT 'active',
    completed_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_goals_active
    ON goals(sort_order)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS goal_contributions (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    -- Signed: positive = deposit, negative = withdrawal, in the goal currency.
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    -- Frozen FX snapshot at write time (mirrors transactions).
    reporting_currency TEXT,
    reporting_amount REAL,
    fx_rate REAL,
    date TEXT NOT NULL,
    note TEXT,
    -- Optional real transfer this contribution also moved (power mode).
    linked_transaction_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal
    ON goal_contributions(goal_id)
    WHERE deleted_at IS NULL;
`;

export const migration043Goals: DbMigration = {
  version: 43,
  name: '043_goals',
  up(db) {
    db.execSync(GOALS_SQL);
  },
};

export default migration043Goals;
