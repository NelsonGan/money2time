// Native module pulled in at load by userAssets — stub so the file imports.
jest.mock('expo-file-system/next', () => ({
  File: class {},
  Directory: class {},
  Paths: { document: '/doc' },
}));

// Controllable raw-SQL handler standing in for the real SQLite connection.
let queryHandler: (sql: string) => { v: string | null }[] = () => [];
jest.mock('~/lib/db/client', () => ({
  getSQLite: () => ({ getAllSync: (sql: string) => queryHandler(sql) }),
}));

import { collectReferencedAssetPaths } from '~/services/userAssetGc';
import { assetRelativePathFromRef } from '~/services/userAssets';

describe('assetRelativePathFromRef', () => {
  it('returns bare relative paths unchanged', () => {
    expect(assetRelativePathFromRef('receipts/a.jpg')).toBe('receipts/a.jpg');
    expect(assetRelativePathFromRef('album-covers/b.jpg')).toBe('album-covers/b.jpg');
    expect(assetRelativePathFromRef('avatars/c.jpg')).toBe('avatars/c.jpg');
    expect(assetRelativePathFromRef('payment-qr/d.jpg')).toBe('payment-qr/d.jpg');
  });

  it('strips the custom: prefix from logo/icon ids', () => {
    expect(assetRelativePathFromRef('custom:account-logos/x.png')).toBe('account-logos/x.png');
    expect(assetRelativePathFromRef('custom:item-icons/y.png')).toBe('item-icons/y.png');
  });

  it('returns null for empty or absent values', () => {
    expect(assetRelativePathFromRef(null)).toBeNull();
    expect(assetRelativePathFromRef(undefined)).toBeNull();
    expect(assetRelativePathFromRef('')).toBeNull();
  });

  it('rejects traversal and absolute paths', () => {
    expect(assetRelativePathFromRef('../secret.png')).toBeNull();
    expect(assetRelativePathFromRef('custom:../secret.png')).toBeNull();
    expect(assetRelativePathFromRef('receipts/../../etc/passwd')).toBeNull();
    expect(assetRelativePathFromRef('/etc/passwd')).toBeNull();
  });

  it('passes built-in (non-custom) ids through — no real file matches them', () => {
    // A built-in bank logo id like "dbs" is harmless: it just never matches a
    // file on disk, so it can never cause a live file to be swept.
    expect(assetRelativePathFromRef('dbs')).toBe('dbs');
  });
});

describe('collectReferencedAssetPaths', () => {
  afterEach(() => {
    queryHandler = () => [];
  });

  it('gathers and normalizes references from every asset-bearing column', () => {
    queryHandler = (sql) => {
      if (sql.includes('profile_avatar_uri')) return [{ v: 'avatars/me.jpg' }];
      if (sql.includes('payment_qr_uri')) return [{ v: 'payment-qr/pay.jpg' }];
      if (sql.includes('FROM transactions')) return [{ v: 'receipts/live.jpg' }];
      if (sql.includes('FROM receipt_splits')) return [{ v: 'receipts/split.jpg' }];
      if (sql.includes('FROM albums')) return [{ v: 'album-covers/trip.jpg' }];
      if (sql.includes('FROM accounts'))
        return [{ v: 'custom:account-logos/bank.png' }, { v: 'dbs' }];
      if (sql.includes('FROM items')) return [{ v: 'custom:item-icons/thing.png' }];
      return [];
    };

    expect(collectReferencedAssetPaths()).toEqual(
      new Set([
        'avatars/me.jpg',
        'payment-qr/pay.jpg',
        'receipts/live.jpg',
        'receipts/split.jpg',
        'album-covers/trip.jpg',
        'account-logos/bank.png',
        'dbs',
        'item-icons/thing.png',
      ]),
    );
  });

  it('only queries live (non-soft-deleted) rows so orphans behind deleted rows are swept', () => {
    const seen: string[] = [];
    queryHandler = (sql) => {
      seen.push(sql);
      return [];
    };
    collectReferencedAssetPaths();
    // Every row-bearing table must be scoped to deleted_at IS NULL, otherwise a
    // deleted transaction's receipt would count as referenced and never reclaimed.
    const rowTables = seen.filter((sql) =>
      /FROM (transactions|receipt_splits|albums|accounts|items)/.test(sql),
    );
    expect(rowTables.length).toBeGreaterThanOrEqual(5);
    rowTables.forEach((sql) => expect(sql).toContain('deleted_at IS NULL'));
  });

  it('drops null column values without adding them to the set', () => {
    queryHandler = (sql) => (sql.includes('FROM transactions') ? [{ v: null }] : []);
    expect(collectReferencedAssetPaths().size).toBe(0);
  });
});
