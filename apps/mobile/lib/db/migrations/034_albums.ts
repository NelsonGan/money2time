import type { DbMigration } from './types';

const ALBUMS_SQL = `
  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    cover_photo_uri TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS album_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    album_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_album_transactions_active_album
    ON album_transactions(album_id)
    WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_album_transactions_active_transaction
    ON album_transactions(transaction_id)
    WHERE deleted_at IS NULL;
`;

export const migration034Albums: DbMigration = {
  version: 34,
  name: '034_albums',
  up(db) {
    db.execSync(ALBUMS_SQL);
  },
};

export default migration034Albums;
