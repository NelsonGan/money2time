import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

/**
 * Payment alerts: bank and wallet notifications turned into transactions (see
 * "Notification review" in the repository README).
 *
 * - `auto_log_captures` holds every alert the pipeline saw: the inbox of ones
 *   waiting for review, the history of ones logged or skipped, and the
 *   provenance row a logged transaction points back to. Raw text is nulled by
 *   a retention sweep; the table is never backed up.
 * - `merchant_categories` is merchant memory: the category a merchant was last
 *   filed under, learned from the user and from Smart categories. It is the
 *   user's own knowledge, so it is backed up.
 * - `accounts.auto_log_identifiers_json` holds the card or account last digits
 *   and names alerts use for an account, so a multi-card bank's alert lands on
 *   the right one.
 * - `settings.auto_log_prefs_json` holds the watched sources and their modes.
 */
const PAYMENT_ALERTS_SQL = `
  CREATE TABLE IF NOT EXISTS auto_log_captures (
    id TEXT PRIMARY KEY NOT NULL,
    channel TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_label TEXT,
    captured_at TEXT NOT NULL,
    native_key TEXT,
    title TEXT,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    resolution_json TEXT,
    parser_version INTEGER NOT NULL DEFAULT 0,
    transaction_id TEXT,
    duplicate_of TEXT,
    dedupe_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auto_log_captures_status
    ON auto_log_captures(status, captured_at)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_auto_log_captures_transaction
    ON auto_log_captures(transaction_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_auto_log_captures_dedupe
    ON auto_log_captures(dedupe_key)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_auto_log_captures_native_key
    ON auto_log_captures(native_key)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS merchant_categories (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_key TEXT NOT NULL,
    display_name TEXT,
    category_id TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'user',
    hits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_categories_key
    ON merchant_categories(merchant_key)
    WHERE deleted_at IS NULL;
`;

export const migration067PaymentAlerts: DbMigration = {
  version: 67,
  name: '067_payment_alerts',
  up(db) {
    db.execSync(PAYMENT_ALERTS_SQL);
    addColumnIfMissing(db, 'accounts', 'auto_log_identifiers_json', 'TEXT');
    addColumnIfMissing(db, 'settings', 'auto_log_prefs_json', 'TEXT');
  },
};

export default migration067PaymentAlerts;
