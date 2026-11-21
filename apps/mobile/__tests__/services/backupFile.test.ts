/**
 * The compact backup file (version 6): gzipped JSON, tables as columns and
 * rows, photos listed rather than embedded. A decoded file must be exactly the
 * `BackupData` an older backup of the same data gives, so every restore path
 * reads it unchanged, and older files must read as they always did.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  buildAutoBackupName,
  isCompactBackupName,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';
import {
  backupFileJson,
  decodeBackupFile,
  encodeBackupFile,
  parseBackupJson,
} from '~/services/backupFile';
import type { BackupData } from '~/services/dataManagementService';

const PHOTO = `money2time_PHOTO_${'0123456789abcdef'.repeat(2)}.jpg`;

function backup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: 3,
    exportedAt: '2026-11-21T06:34:22.021Z',
    tables: {
      accounts: [{ id: 'a1', name: 'Wallet 👛', balance: 12.5, deleted_at: null }],
      account_groups: [],
      categories: [{ id: 'c1', icon: 'emoji:🍔', parent_id: null }],
      transactions: [
        { id: 't1', amount: 120, note: 'Cashback', deleted_at: null, place_name: null },
        { id: 't2', amount: -9.99, note: '午餐', deleted_at: '2026-01-01', place_name: 'Café' },
      ],
      transaction_splits: [],
      recurring_rules: [],
      settings: [{ id: 1, currency_code: 'MYR', profile_avatar_uri: 'avatars/me.jpg' }],
      monthly_wage_settings: [],
    },
    userAssets: [{ path: 'avatars/me.jpg', base64: '/9j/4AAQ' }],
    ...overrides,
  };
}

describe('backup file names', () => {
  it('names new backups as gzip files and still dates older JSON ones', () => {
    const name = buildAutoBackupName(new Date('2026-11-21T06:34:22.021Z'));
    expect(name).toBe('money2time_AUTO_2026-11-21T06-34-22.json.gz');
    expect(isCompactBackupName(name)).toBe(true);
    expect(parseTimestampFromName(name)).toBe('2026-11-21T06:34:22.000Z');
    expect(parseTimestampFromName('money2time_AUTO_2026-11-21T06-34-22.json')).toBe(
      '2026-11-21T06:34:22.000Z',
    );
    expect(isCompactBackupName('money2time_AUTO_2026-11-21T06-34-22.json')).toBe(false);
    // A stored photo beside the backups is not a backup.
    expect(parseTimestampFromName(PHOTO)).toBeNull();
    expect(parseTimestampFromName('money2time_AUTO_2026-11-21T06-34-22.txt')).toBeNull();
  });
});

describe('writing', () => {
  it('packs each table as columns and rows, keeping nulls', () => {
    const file = JSON.parse(backupFileJson(backup()));
    expect(file).toMatchObject({ version: 6, dataVersion: 3 });
    expect(file.tables.transactions).toEqual({
      columns: ['id', 'amount', 'note', 'deleted_at', 'place_name'],
      rows: [
        ['t1', 120, 'Cashback', null, null],
        ['t2', -9.99, '午餐', '2026-01-01', 'Café'],
      ],
    });
    expect(file.tables.account_groups).toEqual([]);
  });

  it('keeps a table whose rows differ as one object per row', () => {
    // A missing key restores the column default; a null writes NULL. Packing
    // these rows would turn one into the other.
    const rows = [{ id: 'x', a: 1 }, { id: 'y' }];
    const data = backup();
    data.tables.items = rows;
    data.tables.albums = [{ id: 'al', icon: undefined }];
    const file = JSON.parse(backupFileJson(data));
    expect(file.tables.items).toEqual(rows);
    expect(Array.isArray(file.tables.albums)).toBe(true);
  });

  it('embeds photos unless they are listed', () => {
    expect(JSON.parse(backupFileJson(backup())).userAssets).toHaveLength(1);
    const listed = JSON.parse(backupFileJson(backup(), [{ path: 'avatars/me.jpg', photo: PHOTO }]));
    expect(listed.userAssets).toBeUndefined();
    expect(listed.photos).toEqual([{ path: 'avatars/me.jpg', photo: PHOTO }]);
  });

  it('never writes the in-memory file list', () => {
    const data = backup({ assetFiles: [{ path: 'avatars/me.jpg', uri: 'file:///x' }] });
    expect(backupFileJson(data, [])).not.toContain('file:///x');
  });

  it('carries the shared ledgers a version 5 backup names', () => {
    const sharedLedgers = [{ ledgerId: 'l1', shareId: 's1' }];
    const file = JSON.parse(backupFileJson(backup({ version: 5, sharedLedgers })));
    expect(file).toMatchObject({ version: 6, dataVersion: 5, sharedLedgers });
  });
});

describe('reading', () => {
  it('decodes a gzipped file to the same backup it was made from', async () => {
    const data = backup();
    const bytes = await encodeBackupFile(data);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
    // Readable by any gzip tool.
    expect(JSON.parse(gunzipSync(bytes).toString('utf8')).version).toBe(6);
    await expect(decodeBackupFile(bytes)).resolves.toEqual(data);
  });

  it('decodes listed photos', async () => {
    const photos = [{ path: 'avatars/me.jpg', photo: PHOTO }];
    const decoded = await decodeBackupFile(await encodeBackupFile(backup(), photos));
    expect(decoded.photos).toEqual(photos);
    expect(decoded.userAssets).toBeUndefined();
  });

  it('reads an older JSON backup exactly as before, as text or bytes', async () => {
    const legacy = backup({ version: 4 });
    const text = JSON.stringify(legacy, null, 2);
    expect(parseBackupJson(text)).toEqual(legacy);
    await expect(decodeBackupFile(text)).resolves.toEqual(legacy);
    await expect(decodeBackupFile(new Uint8Array(Buffer.from(text)))).resolves.toEqual(legacy);
    // Someone gzipped an older backup by hand: the bytes decide, not the name.
    await expect(decodeBackupFile(new Uint8Array(gzipSync(text)))).resolves.toEqual(legacy);
  });

  it('never takes a file list from a file, which would copy any local file into place', () => {
    const crafted = {
      ...backup(),
      assetFiles: [{ path: 'album-covers/x.jpg', uri: 'file:///Documents/SQLite/money2time.db' }],
    };
    expect(parseBackupJson(JSON.stringify(crafted)).assetFiles).toBeUndefined();
    const v6 = { ...JSON.parse(backupFileJson(backup())), assetFiles: crafted.assetFiles };
    expect(parseBackupJson(JSON.stringify(v6)).assetFiles).toBeUndefined();
  });

  it('calls a damaged or cut-short compact file an invalid backup', async () => {
    const bytes = await encodeBackupFile(backup());
    await expect(decodeBackupFile(bytes.subarray(0, bytes.length - 20))).rejects.toThrow(
      'Invalid backup format',
    );
    const garbage = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expect(decodeBackupFile(garbage)).rejects.toThrow('Invalid backup format');
    await expect(decodeBackupFile(new Uint8Array())).rejects.toThrow();
  });

  it('reads the oldest backups: version 1 without images or later tables', async () => {
    const v1 = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      tables: { accounts: [{ id: 'a' }], transactions: [], categories: [], settings: [] },
    };
    await expect(decodeBackupFile(JSON.stringify(v1))).resolves.toEqual(v1);
  });

  it('ignores a photo list in an older backup', () => {
    const legacy = { ...backup(), photos: [{ path: 'avatars/me.jpg', photo: PHOTO }] };
    expect(parseBackupJson(JSON.stringify(legacy)).photos).toBeUndefined();
  });

  it('refuses versions it does not know', () => {
    expect(() => parseBackupJson(JSON.stringify({ ...backup(), version: 7 }))).toThrow(
      'Unsupported backup version: 7',
    );
    const file = JSON.parse(backupFileJson(backup()));
    expect(() => parseBackupJson(JSON.stringify({ ...file, dataVersion: 9 }))).toThrow(
      'Unsupported backup version: 9',
    );
  });

  it('refuses a shared-ledger backup without its ledgers, in either format', () => {
    const legacy = backup({ version: 5 });
    expect(() => parseBackupJson(JSON.stringify(legacy))).toThrow('Invalid shared ledger backup');
    const file = JSON.parse(backupFileJson(backup({ version: 5 })));
    expect(() => parseBackupJson(JSON.stringify(file))).toThrow('Invalid shared ledger backup');
  });

  it('refuses a damaged table or a photo name that is not a stored photo', () => {
    const file = JSON.parse(backupFileJson(backup()));
    const shortRow = structuredClone(file);
    shortRow.tables.transactions.rows[0].pop();
    expect(() => parseBackupJson(JSON.stringify(shortRow))).toThrow('Invalid backup format');
    const notATable = { ...file, tables: { ...file.tables, accounts: { rows: [] } } };
    expect(() => parseBackupJson(JSON.stringify(notATable))).toThrow('Invalid backup format');
    for (const photo of ['../../Documents/money2time.db', 'money2time_PHOTO_x.jpg']) {
      const bad = { ...file, photos: [{ path: 'avatars/me.jpg', photo }] };
      expect(() => parseBackupJson(JSON.stringify(bad))).toThrow('Invalid backup format');
    }
  });
});

describe('size', () => {
  // The shape of a real transactions table: 48 columns, most of them null on
  // most rows (locations, albums, instalments, reimbursements).
  const SPARSE = [
    'from_account_id',
    'to_account_id',
    'recurrence_end_date',
    'recurrence_parent_id',
    'deleted_at',
    'to_amount',
    'account_amount',
    'receipt_uri',
    'reimbursed_at',
    'reimbursement_account_id',
    'reimbursement_transaction_id',
    'reimbursement_of_id',
    'day_order',
    'details',
    'instalment_rule_id',
    'instalment_number',
    'created_by',
    'member_id',
    'fee_of_id',
    'album_group_id',
    'album_category',
    'album_category_name',
    'album_category_icon',
    'latitude',
    'longitude',
    'place_name',
    'place_address',
    'place_id',
    'place_category',
  ];
  function transactions(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      type: i % 7 === 0 ? 'income' : 'expense',
      amount: (i * 37) % 500,
      currency: 'MYR',
      date: new Date(Date.UTC(2024, 0, 1) + i * 3_600_000).toISOString(),
      account_id: `acct-${i % 9}`,
      category_id: `cat-${i % 40}`,
      note: i % 3 === 0 ? `Lunch ${i % 50}` : '',
      recurrence_pattern: 'none',
      recurrence_interval: 1,
      created_at: '2026-11-21T06:33:53.572Z',
      updated_at: '2026-11-21T06:33:53.572Z',
      sentiment: 'neutral',
      reporting_currency: null,
      reporting_amount: null,
      fx_rate: null,
      reimbursable: 0,
      counts_as_expense: 0,
      ledger_id: 'default',
      ...Object.fromEntries(SPARSE.map((column) => [column, null])),
    }));
  }

  it('is a small fraction of an older backup of the same data', async () => {
    const data = backup({ userAssets: [] });
    data.tables.transactions = transactions(5000);
    const legacy = JSON.stringify(data).length;
    const packed = backupFileJson(data, []).length;
    const compact = (await encodeBackupFile(data, [])).length;
    expect(packed / legacy).toBeLessThan(0.5);
    expect(compact / legacy).toBeLessThan(0.1);
  });
});
