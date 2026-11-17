import migration096 from '~/lib/db/migrations/096_album_flag_icons';

import { openAppDatabase } from '../helpers/appDatabase';

// Migration 096 (README: Key patterns > Albums, An album's icon): an album
// placed before the forms filled in a flag gets its country's flag once, on
// real SQLite. An icon the user set or removed stays.

jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: jest.fn() }));
jest.mock('drizzle-orm', () => ({
  ...jest.requireActual('../../node_modules/drizzle-orm/index.cjs'),
  ...jest.requireActual('../../node_modules/drizzle-orm/sqlite-core/index.cjs'),
}));

const NOW = '2026-11-17T00:00:00.000Z';

function album(
  app: ReturnType<typeof openAppDatabase>,
  id: string,
  icon: string | null,
  countryCode: string | null,
  deletedAt: string | null = null,
) {
  app.db.runSync(
    `INSERT INTO albums (id, ledger_id, name, icon, country_code, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, 'default', ?, ?, ?, 0, ?, ?, ?)`,
    [id, id, icon, countryCode, NOW, NOW, deletedAt],
  );
}

function rows(app: ReturnType<typeof openAppDatabase>) {
  return Object.fromEntries(
    app.db
      .getAllSync<{
        id: string;
        icon: string | null;
        updated_at: string;
      }>('SELECT id, icon, updated_at FROM albums ORDER BY id')
      .map((row) => [row.id, row]),
  );
}

describe('album flag icons migration', () => {
  it('gives an album with a country and no icon its flag, and leaves the rest', () => {
    const app = openAppDatabase();
    album(app, 'japan', null, 'JP');
    album(app, 'penang', null, 'my');
    album(app, 'picked', 'plane', 'US');
    album(app, 'removed', '', 'SG');
    album(app, 'nowhere', null, null);
    album(app, 'odd', null, 'XYZ');
    album(app, 'gone', null, 'CN', NOW);

    migration096.up(app.db);
    const after = rows(app);

    expect(after.japan?.icon).toBe('emoji:🇯🇵');
    expect(after.penang?.icon).toBe('emoji:🇲🇾');
    expect(after.picked?.icon).toBe('plane');
    expect(after.removed?.icon).toBe('');
    expect(after.nowhere?.icon).toBeNull();
    expect(after.odd?.icon).toBeNull();
    expect(after.gone?.icon).toBeNull();
    // Each phone fills its own: no newer stamp to win over a synced removal.
    expect(after.japan?.updated_at).toBe(NOW);
  });

  it('is a no-op when replayed', () => {
    const app = openAppDatabase();
    album(app, 'japan', null, 'JP');
    migration096.up(app.db);
    migration096.up(app.db);
    expect(rows(app).japan?.icon).toBe('emoji:🇯🇵');
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration096.version).toBe(96);
    expect(migration096.name).toBe('096_album_flag_icons');
  });
});
