import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

/**
 * Tables whose rows belong to one ledger. Child tables (splits, receipt splits,
 * album joins, budget lines) belong to their parent row's ledger and carry no
 * column of their own. Keep in step with `LEDGER_TABLES` in lib/db/ledgerScope.ts.
 */
const LEDGER_ROOT_TABLES = [
  'accounts',
  'account_groups',
  'categories',
  'transactions',
  'recurring_rules',
  'albums',
  'items',
  'budget_templates',
  'monthly_budgets',
  'auto_log_captures',
] as const;

// Ledgers: separate books (Personal, Work, …) in the one database.
// - `ledgers` lists them. The row with id 'default' is every install's first
//   ledger and holds all data written before this migration. Its name and
//   currency are NULL: the default ledger keeps reading its currency from the
//   settings row, exactly as before.
// - `ledger_id` on each root table, defaulting to 'default'. A constant-default
//   ADD COLUMN only rewrites the schema, never the rows, so this is instant on
//   any database size.
// - `settings.active_ledger_id`: the ledger open on this phone (NULL = default).
// - One live budget per period now holds per ledger.
// No plain ledger_id index on purpose: with only one or a few ledgers it is
// barely selective, and without ANALYZE stats SQLite could pick it over the
// date and account indexes that the transaction queries rely on.
// Numbered 073 because Cloud Sync's branch already uses 072. 073 shipped first
// (build 493), so phones that ran it skip 072: 074 creates 072's tables too.
export const migration073Ledgers: DbMigration = {
  version: 73,
  name: '073_ledgers',
  up(db) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS ledgers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        emoji TEXT,
        currency_code TEXT,
        currency_symbol TEXT,
        prefs_json TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      INSERT OR IGNORE INTO ledgers (id, sort_order, created_at, updated_at)
        VALUES ('default', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `);
    for (const table of LEDGER_ROOT_TABLES) {
      addColumnIfMissing(db, table, 'ledger_id', "TEXT NOT NULL DEFAULT 'default'");
    }
    addColumnIfMissing(db, 'settings', 'active_ledger_id', 'TEXT');
    db.execSync(`
      DROP INDEX IF EXISTS idx_monthly_budgets_period_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_budgets_ledger_period_key
        ON monthly_budgets(ledger_id, period, month)
        WHERE deleted_at IS NULL;
    `);
  },
};

export default migration073Ledgers;
