import type { DbMigration } from './types';

const RECEIPT_SPLITS_SQL = `
  CREATE TABLE IF NOT EXISTS receipt_splits (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    merchant TEXT,
    receipt_date TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    receipt_image_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_splits_transaction
    ON receipt_splits(transaction_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS receipt_split_items (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_split_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL,
    line_total REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_receipt_split_items_split
    ON receipt_split_items(receipt_split_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS receipt_split_item_shares (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_split_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    person_name TEXT NOT NULL,
    is_self INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_receipt_split_item_shares_split
    ON receipt_split_item_shares(receipt_split_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_receipt_split_item_shares_item
    ON receipt_split_item_shares(item_id)
    WHERE deleted_at IS NULL;
`;

export const migration045ReceiptSplits: DbMigration = {
  version: 45,
  name: '045_receipt_splits',
  up(db) {
    db.execSync(RECEIPT_SPLITS_SQL);
  },
};

export default migration045ReceiptSplits;
