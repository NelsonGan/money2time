import type { DbMigration } from './types';

const ITEMS_SQL = `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon_id TEXT,
    purchase_price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    end_date TEXT,
    sale_price REAL,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_items_active
    ON items(sort_order)
    WHERE deleted_at IS NULL;
`;

export const migration038Items: DbMigration = {
  version: 38,
  name: '038_items',
  up(db) {
    db.execSync(ITEMS_SQL);
  },
};

export default migration038Items;
