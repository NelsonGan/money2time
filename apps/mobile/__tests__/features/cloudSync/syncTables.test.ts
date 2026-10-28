import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  captureTriggersSql,
  dropCaptureTriggersSql,
  enqueueAllSql,
} from '~/features/cloudSync/lib/capture';
import {
  ASSET_COLUMNS,
  DEVICE_LOCAL_SETTINGS_COLUMNS,
  isDeviceLocalColumn,
  SYNC_TABLES,
} from '~/features/cloudSync/lib/syncTables';

const root = join(__dirname, '../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('synced tables', () => {
  it('are exactly the tables a backup holds', () => {
    const source = read('services/dataManagementService.ts');
    const body = source.slice(source.indexOf('tables: {'), source.indexOf('},\n  };\n}'));
    const backupTables = [...body.matchAll(/^\s{6}([a-z_]+):/gm)].map((m) => m[1]);
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
