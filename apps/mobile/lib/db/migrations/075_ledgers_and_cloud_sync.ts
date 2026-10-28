import { addColumnIfMissing, tableColumns } from './helpers';
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

// Ledgers, Cloud Sync and shared ledgers, in one migration.
//
// These shipped as 072 (Cloud Sync), 073 (ledgers) and 074 (shared ledgers),
// but 073 reached the store first (build 493). Phones that ran it were at
// version 73, so the runner skipped 072, and 074 then failed on the missing
// sync tables. This migration replaces all three and gets every phone to the
// same schema whichever of them it ran: every step checks before it changes
// anything, so on a phone that already reached 74 it changes nothing. It is
// numbered 075 so that phones at 73 or 74 still run it.
//
// Ledgers: separate books (Personal, Work, …) in the one database.
// - `ledgers` lists them. The row with id 'default' is every install's first
//   ledger and holds all data written before ledgers. Its name and currency
//   are NULL: the default ledger keeps reading its currency from the settings
//   row, exactly as before.
// - `ledger_id` on each root table, defaulting to 'default'. A constant-default
//   ADD COLUMN only rewrites the schema, never the rows, so this is instant on
//   any database size.
// - `settings.active_ledger_id`: the ledger open on this phone (NULL = default).
// - One live budget per period now holds per ledger.
// No plain ledger_id index on purpose: with only one or a few ledgers it is
// barely selective, and without ANALYZE stats SQLite could pick it over the
// date and account indexes that the transaction queries rely on.
//
// Cloud Sync bookkeeping (features/cloudSync). Nothing here is user data and
// none of it is in backups; the triggers that fill sync_outbox are created at
// runtime, and only while Cloud Sync is on (features/cloudSync/lib/capture.ts).
// - sync_outbox: rows changed on this phone and not yet copied to the sync
//   replica. `seq` increases with every change, so a flush can tell whether a
//   row changed again while it was being copied.
// - sync_row_meta: the revision of each row this phone last wrote or applied,
//   per channel. A pull compares it with the replica's to find rows other
//   phones changed.
// - sync_media_pending: images waiting to upload, kept until they are up.
// - sync_media_missing: images synced rows use that failed to download, retried
//   on later syncs.
// - sync_state: small key/values, including the `applying` flag that keeps the
//   triggers quiet while pulled rows are written.
//
// Shared ledgers (features/sharedLedgers, README.md > Cloud Sync > Shared
// ledgers). Bookkeeping only, none of it in backups.
// - shared_ledgers: this phone's ledgers that are shared, as the Worker last
//   reported them: its id there, whether this user owns it, who does, and
//   whether it syncs (it pauses while the owner is not Pro).
// - The channel on the sync bookkeeping: each shared ledger syncs with its own
//   cloud database, the rest with the user's own ('personal'). The image
//   queues are keyed per channel, because one image can belong to two (a logo
//   copied into a shared ledger).
export const migration075LedgersAndCloudSync: DbMigration = {
  version: 75,
  name: '075_ledgers_and_cloud_sync',
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

      CREATE TABLE IF NOT EXISTS sync_outbox (
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        PRIMARY KEY (table_name, row_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_seq ON sync_outbox(seq);
      CREATE TABLE IF NOT EXISTS sync_row_meta (
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        rev TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'personal',
        PRIMARY KEY (table_name, row_id)
      );
      CREATE TABLE IF NOT EXISTS sync_media_pending (
        path TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'personal',
        PRIMARY KEY (path, channel)
      );
      CREATE TABLE IF NOT EXISTS sync_media_missing (
        path TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'personal',
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (path, channel)
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT
      );
      INSERT OR IGNORE INTO sync_state (key, value) VALUES ('applying', '0');

      CREATE TABLE IF NOT EXISTS shared_ledgers (
        ledger_id TEXT NOT NULL PRIMARY KEY,
        share_id TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        name TEXT,
        owner_name TEXT,
        member_count INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
    `);

    // A phone that ran 072 but not 074 has the sync tables without a channel.
    // No store build shipped 072 alone; internal and dev builds did.
    // sync_row_meta takes the column in place. The image queues need a new
    // key, so they are rebuilt with their rows kept under 'personal'.
    addColumnIfMissing(db, 'sync_row_meta', 'channel', `TEXT NOT NULL DEFAULT 'personal'`);
    db.execSync('CREATE INDEX IF NOT EXISTS idx_sync_row_meta_channel ON sync_row_meta(channel);');
    for (const table of ['sync_media_pending', 'sync_media_missing'] as const) {
      if (tableColumns(db, table).has('channel')) continue;
      const attempts = table === 'sync_media_missing';
      db.execSync(`
        DROP TABLE IF EXISTS ${table}_v2;
        CREATE TABLE ${table}_v2 (
          path TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'personal',
          ${attempts ? 'attempts INTEGER NOT NULL DEFAULT 0,' : ''}
          PRIMARY KEY (path, channel)
        );
        INSERT INTO ${table}_v2 (path${attempts ? ', attempts' : ''})
          SELECT path${attempts ? ', attempts' : ''} FROM ${table};
        DROP TABLE ${table};
        ALTER TABLE ${table}_v2 RENAME TO ${table};
      `);
    }
  },
};

export default migration075LedgersAndCloudSync;
