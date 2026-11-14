import type { DbMigration } from './types';

// A shared album's activity log (README: Album members and shared albums >
// Activity). Written by the Worker alone, beside every change it makes to the
// group, and synced in the group's database like its other tables: phones
// only read it. Never changed once written.
// - kind: what happened (`bill_added`, `payment_recorded`, `member_joined`…).
// - actor_member_id / actor_user_id: who did it, from their sign-in.
// - expense_id: the bill it is about, when there is one.
// - member_id: the member it is about (joined, left, renamed).
// - data_json: the before and after of what changed (a bill's amount, day,
//   title, payer and shares; a name; Simplify), or the payments recorded.
// - sort_order: the order of the entries one change wrote.
export const migration093AlbumActivity: DbMigration = {
  version: 93,
  name: '093_album_activity',
  up(db) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS album_activity (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        actor_member_id TEXT,
        actor_user_id TEXT,
        expense_id TEXT,
        member_id TEXT,
        data_json TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_album_activity_ledger ON album_activity (ledger_id, created_at);
    `);
  },
};

export default migration093AlbumActivity;
