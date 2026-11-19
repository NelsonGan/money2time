import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// A shared album's own categories (README: Album members and shared albums >
// Categories). Every album starts with the eight defaults; a row here
// changes one (a new name or icon, its place in the list, removed) or adds
// one, for everyone in the album. Synced in the group's database like its
// other tables.
// - key: a default's (`food`…) or an added one's (`c-<id>`); the id is made
//   from the album and the key (`categoryRowId`), one row per category.
// - name / icon: NULL keeps a default's own (its name read in each person's
//   language); an added one always has both.
// - sort_order: its place in the album's list.
// - created_by: the account that last changed it.
// - transactions.album_category_name / album_category_icon: an added or
//   changed category's name and icon on the user's own entry for a bill, kept
//   with its key (`album_category`) once the album is no longer shared. NULL
//   for a default as it is.
export const migration097AlbumCategories: DbMigration = {
  version: 97,
  name: '097_album_categories',
  up(db) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS album_categories (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        key TEXT NOT NULL,
        name TEXT,
        icon TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_album_categories_ledger ON album_categories (ledger_id);
    `);
    addColumnIfMissing(db, 'transactions', 'album_category_name', 'TEXT');
    addColumnIfMissing(db, 'transactions', 'album_category_icon', 'TEXT');
  },
};

export default migration097AlbumCategories;
