import type { DbMigration } from './types';

export const migration035AlbumsActive: DbMigration = {
  version: 35,
  name: '035_albums_active',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(albums);');
    const existing = new Set(columns.map((c) => c.name));
    // Marks the single "active" album; transactions created while it is active
    // are auto-added to it. Only one album is active at a time (enforced in the repo).
    if (!existing.has('is_active')) {
      db.execSync('ALTER TABLE albums ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;');
    }
  },
};

export default migration035AlbumsActive;
