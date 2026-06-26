import type { DbMigration } from './types';

export const migration037AlbumLocation: DbMigration = {
  version: 37,
  name: '037_album_location',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(albums);');
    const existing = new Set(columns.map((c) => c.name));
    // Optional real-world location for an album. "Located" = latitude IS NOT NULL.
    // place_id keeps the GeoNames id so the place can be re-resolved later.
    const adds: [string, string][] = [
      ['latitude', 'REAL'],
      ['longitude', 'REAL'],
      ['place_id', 'TEXT'],
      ['place_name', 'TEXT'],
      ['place_admin', 'TEXT'],
      ['country_code', 'TEXT'],
    ];
    adds.forEach(([name, type]) => {
      if (!existing.has(name)) {
        db.execSync(`ALTER TABLE albums ADD COLUMN ${name} ${type};`);
      }
    });
  },
};

export default migration037AlbumLocation;
