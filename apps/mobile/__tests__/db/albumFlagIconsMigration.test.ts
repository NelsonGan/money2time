import { captureTriggersSql } from '~/features/cloudSync/lib/capture';
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

function outbox(app: ReturnType<typeof openAppDatabase>) {
  return (
    app.db.getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = 'albums'",
    )?.n ?? 0
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
    // Each phone fills its own: no newer stamp, nothing to push.
    expect(after.japan?.updated_at).toBe(NOW);
  });

  it('keeps the fill on this phone: Cloud Sync queues nothing', () => {
    const app = openAppDatabase();
    album(app, 'japan', null, 'JP');
    // Cloud Sync is on: its capture triggers are installed.
    app.db.execSync(captureTriggersSql('albums'));
    app.db.runSync("UPDATE albums SET name = 'Japan trip' WHERE id = 'japan'");
    expect(outbox(app)).toBe(1); // the triggers do capture an ordinary edit
    app.db.runSync('DELETE FROM sync_outbox');

    migration096.up(app.db);

    expect(rows(app).japan?.icon).toBe('emoji:🇯🇵');
    expect(outbox(app)).toBe(0);
    // Capture is back on afterwards.
    expect(
      app.db.getFirstSync<{ value: string }>("SELECT value FROM sync_state WHERE key = 'applying'")
        ?.value,
    ).toBe('0');
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
