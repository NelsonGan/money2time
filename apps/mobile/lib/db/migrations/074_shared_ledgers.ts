import { addColumnIfMissing, tableColumns } from './helpers';
import type { DbMigration } from './types';

// Shared ledgers (features/sharedLedgers, README.md > Cloud Sync > Shared
// ledgers). Bookkeeping only, none of it in backups.
// - shared_ledgers: this phone's ledgers that are shared, as the Worker last
//   reported them: its id there, whether this user owns it, who does, and
//   whether it syncs (it pauses while the owner is not Pro).
// - A channel on the Cloud Sync bookkeeping: each shared ledger syncs with its
//   own cloud database, the rest with the user's own ('personal'). A row's
//   revision and its images are recorded per channel.
export const migration074SharedLedgers: DbMigration = {
  version: 74,
  name: '074_shared_ledgers',
  up(db) {
    db.execSync(`
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
    addColumnIfMissing(db, 'sync_row_meta', 'channel', `TEXT NOT NULL DEFAULT 'personal'`);
    db.execSync('CREATE INDEX IF NOT EXISTS idx_sync_row_meta_channel ON sync_row_meta(channel);');
    // The image queues are keyed per channel: one image can belong to two (a
    // logo copied into a shared ledger). The tables only hold paths to retry,
    // so they are rebuilt with their rows kept under 'personal'.
    for (const table of ['sync_media_pending', 'sync_media_missing'] as const) {
      const columns = tableColumns(db, table);
      if (columns.has('channel')) continue;
      const attempts = table === 'sync_media_missing';
      const copy = columns.size
        ? `INSERT INTO ${table}_v2 (path${attempts ? ', attempts' : ''})
             SELECT path${attempts ? ', attempts' : ''} FROM ${table};
           DROP TABLE ${table};`
        : '';
      db.execSync(`
        DROP TABLE IF EXISTS ${table}_v2;
        CREATE TABLE ${table}_v2 (
          path TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'personal',
          ${attempts ? 'attempts INTEGER NOT NULL DEFAULT 0,' : ''}
          PRIMARY KEY (path, channel)
        );
        ${copy}
        ALTER TABLE ${table}_v2 RENAME TO ${table};
      `);
    }
  },
};

export default migration074SharedLedgers;
