import type { DbMigration } from './types';

// Cloud Sync bookkeeping (features/cloudSync). Nothing here is user data and
// none of it is in backups; the triggers that fill sync_outbox are created at
// runtime, and only while Cloud Sync is on (features/cloudSync/lib/capture.ts).
// - sync_outbox: rows changed on this phone and not yet copied to the sync
//   replica. `seq` increases with every change, so a flush can tell whether a
//   row changed again while it was being copied.
// - sync_row_meta: the revision of each row this phone last wrote or applied.
//   A pull compares it with the replica's to find rows other phones changed.
// - sync_media_pending: images waiting to upload, kept until they are up.
// - sync_media_missing: images synced rows use that failed to download, retried
//   on later syncs.
// - sync_state: small key/values, including the `applying` flag that keeps the
//   triggers quiet while pulled rows are written.
export const migration072CloudSync: DbMigration = {
  version: 72,
  name: '072_cloud_sync',
  up(db) {
    db.execSync(`
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
        PRIMARY KEY (table_name, row_id)
      );
      CREATE TABLE IF NOT EXISTS sync_media_pending (
        path TEXT NOT NULL PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS sync_media_missing (
        path TEXT NOT NULL PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT
      );
      INSERT OR IGNORE INTO sync_state (key, value) VALUES ('applying', '0');
    `);
  },
};

export default migration072CloudSync;
