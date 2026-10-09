import type { DbMigration } from './types';

const SPLITS_SQL = `
  CREATE TABLE IF NOT EXISTS transaction_splits (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT NOT NULL,
    person_name TEXT,
    amount REAL NOT NULL,
    is_self INTEGER NOT NULL DEFAULT 0,
    payback_account_id TEXT,
    paid_at TEXT,
    paid_transaction_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_transaction_splits_active_transaction
    ON transaction_splits(transaction_id)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_transaction_splits_active_paid_tx
    ON transaction_splits(paid_transaction_id)
    WHERE deleted_at IS NULL AND paid_transaction_id IS NOT NULL;
`;

export const migration016TransactionSplits: DbMigration = {
  version: 16,
  name: '016_transaction_splits',
  up(db) {
    db.execSync(SPLITS_SQL);
  },
};

export default migration016TransactionSplits;
