import type { DbMigration } from './types';

export const migration036AlbumsDates: DbMigration = {
  version: 36,
  name: '036_albums_dates',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(albums);');
    const existing = new Set(columns.map((c) => c.name));
    // Optional manual start/end dates; null falls back to first/last transaction date.
    if (!existing.has('start_date')) {
      db.execSync('ALTER TABLE albums ADD COLUMN start_date TEXT;');
    }
    if (!existing.has('end_date')) {
      db.execSync('ALTER TABLE albums ADD COLUMN end_date TEXT;');
    }
  },
};

export default migration036AlbumsDates;
