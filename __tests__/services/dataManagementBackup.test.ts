import { getSQLite } from '~/lib/db/client';
import { normalizeCurrencyColumns } from '~/lib/db/normalizeCurrencies';
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

const ITEM_COLUMNS = [
  'id',
  'name',
  'icon_id',
  'purchase_price',
  'currency',
  'purchase_date',
  'end_date',
  'sale_price',
  'note',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
];

describe('dataManagementService item backup/restore', () => {
  const item: Row = {
    id: 'it1',
    name: 'Espresso machine',
    icon_id: 'espresso-machine',
    purchase_price: 365,
    currency: 'USD',
    purchase_date: '2024-01-01',
    end_date: null,
    sale_price: null,
    note: null,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted_at: null,
  };

  function seedItems() {
    const tables: Record<string, Row[]> = { items: [{ ...item }] };
    const fake = createFakeSqlite(tables, { items: ITEM_COLUMNS });
    (getSQLite as jest.Mock).mockReturnValue(fake);
    return fake;
  }

  it('includes items in the backup', async () => {
    seedItems();
    const data = await buildBackupData();
    expect(data.tables.items).toEqual([item]);
  });

  it('restores items from a backup into a fresh database', async () => {
    seedItems();
    const data = await buildBackupData();

    const fresh = createFakeSqlite({ items: [] }, { items: ITEM_COLUMNS });
    (getSQLite as jest.Mock).mockReturnValue(fresh);

    const result = applyBackupData(data);
    expect(result.success).toBe(true);
    expect(fresh.tables.items).toEqual([item]);
  });

  it('clears existing items on restore from a legacy backup with no items key', () => {
    const fresh = createFakeSqlite({ items: [{ ...item }] }, { items: ITEM_COLUMNS });
    (getSQLite as jest.Mock).mockReturnValue(fresh);

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
    // Restore is a full replace, so prior items are cleared, none re-added.
    expect(fresh.tables.items).toEqual([]);
  });
});

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

const RECEIPT_SPLIT_COLUMNS = [
  'id',
  'transaction_id',
  'currency',
  'merchant',
  'receipt_date',
  'source',
  'receipt_image_uri',
  'created_at',
  'updated_at',
  'deleted_at',
];
const RECEIPT_SPLIT_ITEM_COLUMNS = [
  'id',
  'receipt_split_id',
  'name',
  'quantity',
  'line_total',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
];
const RECEIPT_SPLIT_SHARE_COLUMNS = [
  'id',
  'receipt_split_id',
  'item_id',
  'person_name',
  'is_self',
  'weight',
  'created_at',
  'updated_at',
  'deleted_at',
];

describe('dataManagementService receipt-split backup/restore', () => {
  const header: Row = {
    id: 'rs1',
    transaction_id: 'tx1',
    currency: 'USD',
    merchant: 'Sushi Bar',
    receipt_date: '2026-07-01',
    source: 'scan',
    receipt_image_uri: 'receipts/abc.jpg',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
  };
  const item: Row = {
    id: 'ri1',
    receipt_split_id: 'rs1',
    name: 'Salmon roll',
    quantity: 2,
    line_total: 40,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
  };
  const share: Row = {
    id: 'sh1',
    receipt_split_id: 'rs1',
    item_id: 'ri1',
    person_name: 'Sarah',
    is_self: 0,
    weight: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
  };
  const columns = {
    receipt_splits: RECEIPT_SPLIT_COLUMNS,
    receipt_split_items: RECEIPT_SPLIT_ITEM_COLUMNS,
    receipt_split_item_shares: RECEIPT_SPLIT_SHARE_COLUMNS,
  };

  function seed() {
    const tables: Record<string, Row[]> = {
      receipt_splits: [{ ...header }],
      receipt_split_items: [{ ...item }],
      receipt_split_item_shares: [{ ...share }],
    };
    const fake = createFakeSqlite(tables, columns);
    (getSQLite as jest.Mock).mockReturnValue(fake);
    return fake;
  }

  it('includes all three receipt-split tables in the backup', async () => {
    seed();
    const data = await buildBackupData();
    expect(data.tables.receipt_splits).toEqual([header]);
    expect(data.tables.receipt_split_items).toEqual([item]);
    expect(data.tables.receipt_split_item_shares).toEqual([share]);
  });

  it('restores receipt splits from a backup into a fresh database', async () => {
    seed();
    const data = await buildBackupData();

    const fresh = createFakeSqlite(
      { receipt_splits: [], receipt_split_items: [], receipt_split_item_shares: [] },
      columns,
    );
    (getSQLite as jest.Mock).mockReturnValue(fresh);

    const result = applyBackupData(data);
    expect(result.success).toBe(true);
    expect(fresh.tables.receipt_splits).toEqual([header]);
    expect(fresh.tables.receipt_split_items).toEqual([item]);
    expect(fresh.tables.receipt_split_item_shares).toEqual([share]);
  });

  it('clears existing receipt splits on restore from a legacy backup without them', () => {
    const fresh = createFakeSqlite(
      {
        receipt_splits: [{ ...header }],
        receipt_split_items: [{ ...item }],
        receipt_split_item_shares: [{ ...share }],
      },
      columns,
    );
    (getSQLite as jest.Mock).mockReturnValue(fresh);

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
    expect(fresh.tables.receipt_splits).toEqual([]);
    expect(fresh.tables.receipt_split_items).toEqual([]);
    expect(fresh.tables.receipt_split_item_shares).toEqual([]);
  });
});

const TX_COLUMNS = [
  'id',
  'type',
  'amount',
  'currency',
  'reporting_currency',
  'reporting_amount',
  'fx_rate',
  'to_amount',
  'account_amount',
  'date',
  'account_id',
  'category_id',
  'created_at',
  'updated_at',
  'deleted_at',
];
const RATE_COLUMNS = [
  'id',
  'base_currency',
  'quote_currency',
  'rate',
  'as_of_date',
  'source',
  'updated_at',
];

describe('dataManagementService multi-currency backup/restore', () => {
  const normalizeMock = normalizeCurrencyColumns as jest.Mock;

  // A EUR expense recorded in a USD-reporting account, with its frozen FX snapshot.
  const foreignTx: Row = {
    id: 'tx1',
    type: 'expense',
    amount: 10,
    currency: 'EUR',
    reporting_currency: 'USD',
    reporting_amount: 11,
    fx_rate: 1.1,
    to_amount: null,
    account_amount: null,
    date: '2026-06-10',
    account_id: 'acc1',
    category_id: 'cat1',
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
    deleted_at: null,
  };
  const rate: Row = {
    id: 'r1',
    base_currency: 'USD',
    quote_currency: 'EUR',
    rate: 0.9,
    as_of_date: '2026-06-10',
    source: 'api',
    updated_at: '2026-06-10T00:00:00.000Z',
  };

  beforeEach(() => normalizeMock.mockClear());

  it('backs up exchange rates and the frozen FX columns on transactions', async () => {
    const fake = createFakeSqlite(
      { transactions: [{ ...foreignTx }], exchange_rates: [{ ...rate }] },
      { transactions: TX_COLUMNS, exchange_rates: RATE_COLUMNS },
    );
    (getSQLite as jest.Mock).mockReturnValue(fake);

    const data = await buildBackupData();
    expect(data.tables.exchange_rates).toEqual([rate]);
    expect(data.tables.transactions).toEqual([foreignTx]);
  });

  it('restores rates and the foreign-currency code without collapsing it', async () => {
    const source = createFakeSqlite(
      { transactions: [{ ...foreignTx }], exchange_rates: [{ ...rate }] },
      { transactions: TX_COLUMNS, exchange_rates: RATE_COLUMNS },
    );
    (getSQLite as jest.Mock).mockReturnValue(source);
    const data = await buildBackupData();

    const fresh = createFakeSqlite(
      { transactions: [], exchange_rates: [] },
      { transactions: TX_COLUMNS, exchange_rates: RATE_COLUMNS },
    );
    (getSQLite as jest.Mock).mockReturnValue(fresh);

    const result = applyBackupData(data);
    expect(result.success).toBe(true);
    expect(fresh.tables.exchange_rates).toEqual([rate]);
    expect(fresh.tables.transactions).toEqual([foreignTx]);
    // A backup that carries an exchange_rates table is multi-currency, so the
    // currency normalizer must NOT collapse genuine ISO codes (e.g. EUR → USD).
    expect(normalizeMock).toHaveBeenCalledWith(fresh, { collapseAll: false });
  });

  it('collapses currencies only for a legacy backup with no exchange_rates key', () => {
    const fresh = createFakeSqlite({ transactions: [] }, { transactions: TX_COLUMNS });
    (getSQLite as jest.Mock).mockReturnValue(fresh);

    const legacy = {
      version: 1,
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
    expect(normalizeMock).toHaveBeenCalledWith(fresh, { collapseAll: true });
  });
});
