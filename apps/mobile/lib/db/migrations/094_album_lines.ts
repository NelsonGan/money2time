import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// Albums as their own line in the category lists (README: Key patterns >
// Albums).
// - An entry is in one album at most. Older versions could put it in two
//   (adding from an album while another was active, duplicating in an
//   album). Each entry keeps one live link: the one to its shared album when
//   it is a group's bill, else the lowest id, the link Cloud Sync's unique
//   clash rule keeps too, so every phone of the account drops the same ones.
//   Then a partial unique index holds it.
// - album_expenses.category_key: a shared album's bill is filed under one of
//   the fixed album categories (`food`, `transport`…), the same for everyone
//   in it (`features/albums/lib/albumCategories.ts`).
// - transactions.album_category: that key on the user's own entry for the
//   bill (and the entries its payments made), which it keeps once the album
//   is no longer shared, so it never needs one of the user's categories.
// - albums.archived_at: archived (out of the Albums page's list, still a line
//   in the category lists); albums.share_ended_at: a shared album the user is
//   no longer in (left, taken out, ended, signed out), kept as it was,
//   archived and read-only until they are back in it.
export const migration094AlbumLines: DbMigration = {
  version: 94,
  name: '094_album_lines',
  up(db) {
    const now = new Date().toISOString();
    db.runSync(
      `UPDATE album_transactions SET deleted_at = ?, updated_at = ?
       WHERE deleted_at IS NULL
         AND album_id IN (SELECT id FROM albums WHERE deleted_at IS NOT NULL)`,
      [now, now],
    );
    db.runSync(
      `UPDATE album_transactions SET deleted_at = ?, updated_at = ?
       WHERE deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM transactions t
           JOIN album_transactions g
             ON g.transaction_id = t.id AND g.album_id = t.album_group_id AND g.deleted_at IS NULL
           WHERE t.id = album_transactions.transaction_id
             AND album_transactions.album_id <> t.album_group_id
         )`,
      [now, now],
    );
    db.runSync(
      `UPDATE album_transactions SET deleted_at = ?, updated_at = ?
       WHERE deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM album_transactions o
           WHERE o.transaction_id = album_transactions.transaction_id
             AND o.deleted_at IS NULL
             AND o.id < album_transactions.id
         )`,
      [now, now],
    );
    db.execSync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_album_transactions_one_album
        ON album_transactions(transaction_id)
        WHERE deleted_at IS NULL;
    `);
    addColumnIfMissing(db, 'album_expenses', 'category_key', 'TEXT');
    addColumnIfMissing(db, 'transactions', 'album_category', 'TEXT');
    addColumnIfMissing(db, 'albums', 'archived_at', 'TEXT');
    addColumnIfMissing(db, 'albums', 'share_ended_at', 'TEXT');
  },
};

export default migration094AlbumLines;
