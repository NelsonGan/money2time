import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

// Albums as the face of a group (README: Album members and shared albums).
//
// An album can list the people it is split with:
// - albums.split_with_json: `[{ id, name }]`, the people of an album that is
//   not shared. While the album is active a new expense starts split with
//   them.
//
// A shared album's group lives in its own cloud database, reached as a
// shared ledger is. The group's id is the album's id: the album of the person
// who shared it, and the album each person who joins gets in a ledger of their
// own, which is made with that same id. The three tables below carry it in
// `ledger_id`, the column Cloud Sync routes a row by, so their rows go to the
// group's database and nowhere else. They are not a ledger's data: no ledger
// has that id, and a backup leaves them out.
// - album_members: the people of the group. `user_id` is the Cloud Sync
//   account of someone who joined; null is a placeholder, a name someone in
//   the group added, which a person who joins later can take over.
// - album_expenses: one row per bill, with who paid (`paid_by`, a member id)
//   and what each person's share is (`shares_json`, `[{ memberId, amount }]`).
// - album_settlements: a payment from one member to another for a bill. Rows
//   are only ever added, or deleted when the payment is undone.
//
// Each phone keeps only its own side of a group's bills in its own ledger, as
// ordinary split bills:
// - transactions.album_group_id: the group whose bill (the row of
//   album_expenses with this transaction's id) this entry is the user's side
//   of. Null on every other entry.
// - transaction_splits.album_member_id: the group member a share is with.
// - transaction_splits.settlement_id: the settlement a paid row came from, or
//   was sent as, so the same payment is never applied twice.
//
// - shared_ledgers.kind: 'album' for a shared album's group; null is a
//   shared ledger, as every row before this.
export const migration090AlbumGroups: DbMigration = {
  version: 90,
  name: '090_album_groups',
  up(db) {
    addColumnsIfMissing(db, 'albums', [['split_with_json', 'TEXT']]);
    addColumnsIfMissing(db, 'transactions', [['album_group_id', 'TEXT']]);
    addColumnsIfMissing(db, 'transaction_splits', [
      ['album_member_id', 'TEXT'],
      ['settlement_id', 'TEXT'],
    ]);
    addColumnsIfMissing(db, 'shared_ledgers', [['kind', 'TEXT']]);
    db.execSync(`
      CREATE TABLE IF NOT EXISTS album_members (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        name TEXT NOT NULL,
        user_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_album_members_group ON album_members(ledger_id);
      CREATE TABLE IF NOT EXISTS album_expenses (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        category_name TEXT,
        category_icon TEXT,
        paid_by TEXT NOT NULL,
        shares_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_album_expenses_group ON album_expenses(ledger_id);
      CREATE TABLE IF NOT EXISTS album_settlements (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        expense_id TEXT,
        from_member TEXT NOT NULL,
        to_member TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        date TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_album_settlements_group ON album_settlements(ledger_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_album_group
        ON transactions(album_group_id) WHERE album_group_id IS NOT NULL;
    `);
  },
};

export default migration090AlbumGroups;
