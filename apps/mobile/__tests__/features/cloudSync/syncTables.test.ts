import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  captureTriggersSql,
  dropCaptureTriggersSql,
  enqueueAllSql,
} from '~/features/cloudSync/lib/capture';
import type { Row } from '~/features/cloudSync/lib/rowCodec';
import {
  ASSET_COLUMNS,
  DEVICE_LOCAL_SETTINGS_COLUMNS,
  hasMeaningfulRows,
  isDeviceLocalColumn,
  SYNC_TABLES,
  type SyncTable,
} from '~/features/cloudSync/lib/syncTables';

const root = join(__dirname, '../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('synced tables', () => {
  it('are exactly the tables a backup holds', () => {
    const source = read('services/dataManagementService.ts');
    // The `tables: { … }` block of buildBackupData: one key per line, written
    // `name: …` or as the shorthand `name,`.
    const start = source.indexOf('tables: {');
    const body = source.slice(start, source.indexOf('\n    },', start));
    const backupTables = [...body.matchAll(/^\s{6}([a-z_]+)(?::|,$)/gm)].map((m) => m[1]);
    expect([...SYNC_TABLES].sort()).toEqual([...new Set(backupTables)].sort());
  });

  it('cover every image column the orphan sweep protects', () => {
    const source = read('services/userAssetGc.ts');
    const swept = [...source.matchAll(/SELECT ([a-z_]+) AS v FROM ([a-z_]+)/g)].map(
      (m) => `${m[2]}.${m[1]}`,
    );
    const synced = Object.entries(ASSET_COLUMNS).flatMap(([table, columns]) =>
      (columns ?? []).map((column) => `${table}.${column}`),
    );
    expect(synced.sort()).toEqual(swept.sort());
  });

  it('keep the purchase identity on the phone', () => {
    expect(DEVICE_LOCAL_SETTINGS_COLUMNS.has('app_user_id')).toBe(true);
    expect(isDeviceLocalColumn('settings', 'app_user_id')).toBe(true);
    // Each phone keeps its own open ledger.
    expect(isDeviceLocalColumn('settings', 'active_ledger_id')).toBe(true);
    expect(isDeviceLocalColumn('transactions', 'app_user_id')).toBe(false);
  });

  it('only name columns the settings table has', () => {
    const schema = read('lib/db/schema.ts');
    for (const column of DEVICE_LOCAL_SETTINGS_COLUMNS) {
      expect(schema).toContain(`'${column}'`);
    }
  });
});

describe('capture SQL', () => {
  it('creates quiet insert, update and delete triggers', () => {
    const sql = captureTriggersSql('transactions');
    expect(sql.match(/CREATE TRIGGER IF NOT EXISTS/g)).toHaveLength(3);
    expect(sql).toContain('AFTER DELETE ON "transactions"');
    expect(sql).toContain('OLD.id');
    expect(sql.match(/key = 'applying'\) IS NOT '1'/g)).toHaveLength(3);
  });

  it('drops the same triggers', () => {
    const sql = dropCaptureTriggersSql('items');
    expect(sql.match(/DROP TRIGGER IF EXISTS m2t_sync_items_(ins|upd|del);/g)).toHaveLength(3);
  });

  it('can queue a whole table', () => {
    expect(enqueueAllSql('albums')).toContain(`SELECT 'albums', id`);
  });
});

describe('what counts as recorded data', () => {
  const side = (rows: Partial<Record<SyncTable, Row[]>>) => (table: SyncTable) => rows[table] ?? [];
  const starter: Row = { id: 'cash', type: 'debit', starting_balance: 0 };

  it('leaves out what onboarding sets up', () => {
    expect(
      hasMeaningfulRows(
        side({
          accounts: [starter],
          categories: [{ id: 'food' }],
          ledgers: [{ id: 'default', name: 'Home' }],
          monthly_wage_settings: [{ id: 'wage' }],
        }),
      ),
    ).toBe(false);
  });

  it.each<[string, Partial<Record<SyncTable, Row[]>>]>([
    ['a transaction', { transactions: [{ id: 'lunch' }] }],
    ['an account balance', { accounts: [starter, { ...starter, starting_balance: 20000 }] }],
    ['a savings goal', { accounts: [{ id: 'trip', type: 'goal', starting_balance: 0 }] }],
    ['a loan', { accounts: [{ id: 'car', type: 'loan', starting_balance: 0 }] }],
    ['a ledger of its own', { ledgers: [{ id: 'default' }, { id: 'work' }] }],
  ])('counts %s', (_label, rows) => {
    expect(hasMeaningfulRows(side(rows))).toBe(true);
  });
});
