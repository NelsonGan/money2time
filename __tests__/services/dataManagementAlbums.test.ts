import { getSQLite } from '~/lib/db/client';
import { applyBackupData, buildBackupData } from '~/services/dataManagementService';

// Native modules pulled in at module load but only used by export/picker paths
// we don't exercise here — stub them so the file can be imported under Jest.
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system/next', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('~/services/userAssets', () => ({
  collectUserAssetsForBackup: jest.fn(async () => []),
  restoreUserAssetsFromBackup: jest.fn(),
}));
jest.mock('~/lib/db/normalizeCurrencies', () => ({ normalizeCurrencyColumns: jest.fn() }));

const ALBUM_COLUMNS = [
  'id',
  'name',
  'cover_photo_uri',
  'is_active',
  'start_date',
  'end_date',
  'latitude',
  'longitude',
  'place_id',
  'place_name',
  'place_admin',
  'country_code',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
];
const ALBUM_TX_COLUMNS = [
  'id',
  'album_id',
  'transaction_id',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
];

type Row = Record<string, unknown>;

/**
 * Minimal in-memory SQLite stand-in that understands just the handful of
 * statements dataManagementService issues: SELECT *, PRAGMA table_info,
 * INSERT OR REPLACE, DELETE, and BEGIN/COMMIT/ROLLBACK.
 */
function createFakeSqlite(tables: Record<string, Row[]>, columns: Record<string, string[]>) {
  return {
    getAllSync(sql: string) {
      const pragma = /PRAGMA table_info\((\w+)\)/.exec(sql);
      if (pragma) return (columns[pragma[1]] ?? []).map((name) => ({ name }));
      if (/app_user_id\s+FROM\s+settings/i.test(sql)) return [{ app_user_id: 'user-1' }];
      const from = /FROM\s+(\w+)/i.exec(sql);
      if (from) return [...(tables[from[1]] ?? [])];
      return [];
    },
    runSync(sql: string, params: unknown[]) {
      const insert = /INSERT OR REPLACE INTO (\w+) \(([^)]+)\)/.exec(sql);
      if (!insert) return;
      const table = insert[1];
      const keys = insert[2].split(',').map((k) => k.trim());
      const row: Row = {};
      keys.forEach((key, i) => {
        row[key] = params[i];
      });
      const existing = (tables[table] ??= []);
      const idx = existing.findIndex((r) => r.id === row.id);
      if (idx >= 0) existing[idx] = row;
      else existing.push(row);
    },
    execSync(sql: string) {
      const del = /DELETE FROM (\w+)/i.exec(sql);
      if (del) tables[del[1]] = [];
    },
    tables,
  };
}

describe('dataManagementService album backup/restore', () => {
  const album: Row = {
    id: 'al1',
    name: 'Japan',
    cover_photo_uri: null,
    is_active: 0,
    start_date: '2026-06-01',
    end_date: null,
    latitude: 35.68,
    longitude: 139.69,
    place_id: 'p1',
    place_name: 'Tokyo',
    place_admin: 'Tokyo',
    country_code: 'JP',
    sort_order: 0,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    deleted_at: null,
  };
  const albumTx: Row = {
    id: 'at1',
    album_id: 'al1',
    transaction_id: 'tx1',
    sort_order: 0,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    deleted_at: null,
  };

  function seed() {
    const tables: Record<string, Row[]> = {
      albums: [{ ...album }],
      album_transactions: [{ ...albumTx }],
    };
    const columns = { albums: ALBUM_COLUMNS, album_transactions: ALBUM_TX_COLUMNS };
    const fake = createFakeSqlite(tables, columns);
    (getSQLite as jest.Mock).mockReturnValue(fake);
    return fake;
  }

  it('includes albums and their join rows in the backup', async () => {
    seed();
    const data = await buildBackupData();
    expect(data.tables.albums).toEqual([album]);
    expect(data.tables.album_transactions).toEqual([albumTx]);
  });

  it('restores albums and join rows from a backup', async () => {
    seed();
    const data = await buildBackupData();

    // Restore into a fresh, empty database.
    const fresh = createFakeSqlite(
      { albums: [], album_transactions: [] },
      { albums: ALBUM_COLUMNS, album_transactions: ALBUM_TX_COLUMNS },
    );
    (getSQLite as jest.Mock).mockReturnValue(fresh);

    const result = applyBackupData(data);
    expect(result.success).toBe(true);
    expect(fresh.tables.albums).toEqual([album]);
    expect(fresh.tables.album_transactions).toEqual([albumTx]);
  });

  it('still restores cleanly from a legacy backup with no album tables', () => {
    const fresh = createFakeSqlite(
      { albums: [{ ...album }], album_transactions: [{ ...albumTx }] },
      { albums: ALBUM_COLUMNS, album_transactions: ALBUM_TX_COLUMNS },
    );
    (getSQLite as jest.Mock).mockReturnValue(fresh);

    // A v3 backup written before albums existed: no album tables at all.
    const legacy = {
      version: 3,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tables: {
        accounts: [],
        account_groups: [],
        categories: [],
        transactions: [],
        transaction_splits: [],
        recurring_rules: [],
        settings: [],
        monthly_wage_settings: [],
      },
    };

    const result = applyBackupData(legacy as never);
    expect(result.success).toBe(true);
    // Restore is a full replace, so prior albums are cleared, none re-added.
    expect(fresh.tables.albums).toEqual([]);
    expect(fresh.tables.album_transactions).toEqual([]);
  });
});
