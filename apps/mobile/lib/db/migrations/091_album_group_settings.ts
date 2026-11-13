import type { DbMigration } from './types';

// What a shared album's group has agreed on (README: Album members and
// shared albums).
// - album_groups: one row per group, with the group's id as its own id and in
//   `ledger_id`, so it syncs in the group's database like the group's other
//   tables (migration 090) and every member's phone reads the same row. A
//   group has no row until someone changes a setting.
//   - simplify_debts: "Simplify group debts". 1 shows the group's debts with
//     as few payments as possible; 0, as every group starts, shows each
//     pair's own.
export const migration091AlbumGroupSettings: DbMigration = {
  version: 91,
  name: '091_album_group_settings',
  up(db) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS album_groups (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        simplify_debts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
  },
};

export default migration091AlbumGroupSettings;
