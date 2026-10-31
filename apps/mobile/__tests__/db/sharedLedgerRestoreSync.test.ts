import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import { forgetChannel } from '~/features/cloudSync/services/ledgerChannels';
import {
  removeSharedLedger,
  saveSharedLedger,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { SyncEngine } from '~/features/cloudSync/services/syncEngine';
import { getSQLite } from '~/lib/db/client';
import { applyMigrations } from '~/lib/db/migrations/runner';
import { applyBackupData, buildBackupData } from '~/services/dataManagementService';

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  File: class {
    exists = false;
  },
  Directory: class {},
}));
jest.mock('expo-file-system/next', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('~/services/userAssets', () => ({
  collectUserAssetsForBackup: jest.fn(async () => []),
  restoreUserAssetsFromBackup: jest.fn(),
  assetRelativePathFromRef: () => null,
  invalidateCustomUriCache: jest.fn(),
}));
jest.mock('~/services/userAssetGc', () => ({
  collectReferencedAssetPaths: () => new Set(),
  runUserAssetGc: jest.fn(),
}));
jest.mock('~/services/resetAutomationCaptureData', () => ({
  resetAutomationCaptureData: jest.fn(),
}));
jest.mock('~/features/cloudSync/services/cloudSyncApi', () => ({
  existingMedia: jest.fn(async () => new Set()),
  uploadMedia: jest.fn(),
}));

const now = '2026-10-31T00:00:00.000Z';
let app: DatabaseSync;
let cloud: DatabaseSync;
let engine: SyncEngine;
let writes: jest.Mock;
let push: jest.Mock;

function putCloud(id: string, amount: number, deletedAt: string | null = null) {
  const row = app.prepare("SELECT * FROM transactions WHERE id = 'lunch'").get()!;
  cloud
    .prepare('INSERT OR REPLACE INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      'transactions',
      id,
      JSON.stringify({ ...row, id, amount, deleted_at: deletedAt }),
      `rev-${id}`,
      'another-phone',
      1,
    );
}

function cloudRow(id: string) {
  const row = cloud.prepare('SELECT data, rev FROM sync_rows WHERE row_id = ?').get(id);
  return row ? { ...JSON.parse(String(row.data)), rev: row.rev } : null;
}

beforeEach(() => {
  app = new DatabaseSync(':memory:');
  cloud = new DatabaseSync(':memory:');
  const flat = (args: unknown[]) => args.flat() as (string | number | null)[];
  const db = {
    execSync: (sql: string) => app.exec(sql),
    getAllSync: (sql: string, ...args: unknown[]) => app.prepare(sql).all(...flat(args)),
    getFirstSync: (sql: string, ...args: unknown[]) => app.prepare(sql).get(...flat(args)) ?? null,
    runSync: (sql: string, ...args: unknown[]) => app.prepare(sql).run(...flat(args)),
    withTransactionSync: (fn: () => void) => {
      app.exec('BEGIN');
      try {
        fn();
        app.exec('COMMIT');
      } catch (error) {
        app.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
  (getSQLite as jest.Mock).mockReturnValue(db);
  const dir = join(__dirname, '../../lib/db/migrations');
  applyMigrations(
    db,
    readdirSync(dir)
      .filter((file) => /^\d{3}_.+\.ts$/.test(file))
      .sort()
      .map((file) => require(join(dir, file)).default),
  );
  app.exec(
    `INSERT INTO settings (id, app_user_id, created_at, updated_at) VALUES ('primary', 'test-user', '${now}', '${now}'); INSERT INTO ledgers (id, name, created_at, updated_at) VALUES ('family', 'Family', '${now}', '${now}'); INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at) VALUES ('lunch', 'family', 'expense', 20, 'USD', '2026-10-31', '${now}', '${now}'); INSERT INTO sync_state VALUES ('attached:family-share', '1');`,
  );
  saveSharedLedger({
    ledgerId: 'family',
    shareId: 'family-share',
    role: 'owner',
    name: 'Family',
    ownerName: 'Owner',
    memberCount: 2,
    active: true,
  });
  cloud.exec(
    'CREATE TABLE sync_rows (table_name TEXT, row_id TEXT, data TEXT, rev TEXT, origin TEXT, updated_at INTEGER, PRIMARY KEY(table_name,row_id)); CREATE TABLE sync_info (key TEXT PRIMARY KEY, value TEXT);',
  );
  push = jest.fn(async () => undefined);
  writes = jest.fn(async (sql: string, args: (string | number | null)[] = []) =>
    cloud.prepare(sql).run(...args),
  );
  const replica = {
    all: async (sql: string, args: (string | number | null)[] = []) =>
      cloud.prepare(sql).all(...args),
    run: writes,
    exec: async (sql: string) => cloud.exec(sql),
    transaction: async (fn: () => Promise<void>) => {
      cloud.exec('BEGIN');
      try {
        await fn();
        cloud.exec('COMMIT');
      } catch (error) {
        cloud.exec('ROLLBACK');
        throw error;
      }
    },
    pull: async () => false,
    push,
  };
  engine = new SyncEngine({
    userId: 'test-user',
    channel: 'family-share',
    ledgerId: 'family',
    url: 'local-test',
    getTursoToken: async () => 'local-test',
    getSessionToken: async () => 'local-test',
    mediaPath: '/local-test',
    deviceName: 'Test',
  });
  Object.assign(engine, { replica });
});

afterEach(() => {
  removeSharedLedger('family');
  app.close();
  cloud.close();
});

async function stage() {
  const backup = await buildBackupData();
  const snapshot = await engine.prepareSnapshotRestore();
  expect(
    applyBackupData(backup, {
      restorePersonal: false,
      sharedLedgerIds: ['family'],
      beforeCommit: () => engine.stageSnapshotRestore(snapshot),
    }).success,
  ).toBe(true);
}

it('preserves unchanged revisions and uploads only differing rows', async () => {
  putCloud('lunch', 20);
  await stage();
  await engine.syncNow();
  expect(cloudRow('lunch').rev).toBe('rev-lunch');
  expect(writes.mock.calls.filter(([sql]) => sql.includes('UPDATE sync_rows'))).toHaveLength(0);
});

it('replaces changed data and deletes cloud-only records with a tombstone', async () => {
  putCloud('lunch', 35);
  putCloud('cloud-only', 100);
  await stage();
  await engine.syncNow();
  expect(cloudRow('lunch').amount).toBe(20);
  expect(cloudRow('cloud-only').deleted_at).toBeTruthy();
});

it('intentionally revives a backup row even when a previously unseen cloud deletion exists', async () => {
  putCloud('lunch', 20, now);
  app
    .prepare('INSERT INTO sync_row_meta VALUES (?, ?, ?, ?)')
    .run('transactions', 'lunch', 'old-rev', 'family-share');
  await stage();
  await engine.syncNow();
  expect(cloudRow('lunch').deleted_at).toBeNull();
});

it('retries an upload failure without discarding the staged replica changes', async () => {
  putCloud('lunch', 35);
  await stage();
  push.mockRejectedValueOnce(new Error('offline'));
  await expect(engine.syncNow()).rejects.toThrow('offline');
  expect(
    app.prepare("SELECT value FROM sync_state WHERE key = 'unpushed:family-share'").get()?.value,
  ).toBe('1');
  await engine.syncNow();
  expect(push).toHaveBeenCalledTimes(2);
  expect(cloudRow('lunch').amount).toBe(20);
  expect(
    app.prepare("SELECT value FROM sync_state WHERE key = 'unpushed:family-share'").get()?.value,
  ).toBe('0');
});

it('does not touch rows of another ledger injected into a shared cloud channel', async () => {
  putCloud('foreign', 100);
  const row = cloudRow('foreign');
  cloud
    .prepare('UPDATE sync_rows SET data = ? WHERE row_id = ?')
    .run(JSON.stringify({ ...row, ledger_id: 'private' }), 'foreign');
  await stage();
  await engine.syncNow();
  expect(cloudRow('foreign').deleted_at).toBeNull();
});

it('includes cloud-only children whose parent has never existed locally', async () => {
  putCloud('cloud-parent', 100);
  const child = {
    id: 'cloud-split',
    transaction_id: 'cloud-parent',
    amount: 50,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  cloud
    .prepare('INSERT INTO sync_rows VALUES (?, ?, ?, ?, ?, ?)')
    .run('transaction_splits', child.id, JSON.stringify(child), 'child-rev', 'another-phone', 1);
  await stage();
  await engine.syncNow();
  expect(cloudRow('cloud-parent').deleted_at).toBeTruthy();
  const stored = cloud.prepare('SELECT data FROM sync_rows WHERE row_id = ?').get(child.id);
  expect(!stored || JSON.parse(String(stored.data)).deleted_at != null).toBe(true);
});

it('does not let a later stale edit revive a row deleted by recovery', async () => {
  putCloud('old-dinner', 100);
  const old = cloudRow('old-dinner');
  await stage();
  await engine.syncNow();
  app
    .prepare(
      'INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('old-dinner', 'family', 'expense', 200, 'USD', '2026-10-31', now, now);
  app
    .prepare('INSERT OR REPLACE INTO sync_row_meta VALUES (?, ?, ?, ?)')
    .run('transactions', 'old-dinner', old.rev, 'family-share');
  await engine.syncNow();
  expect(cloudRow('old-dinner').deleted_at).toBeTruthy();
  expect(
    app.prepare("SELECT deleted_at FROM transactions WHERE id = 'old-dinner'").get()?.deleted_at,
  ).toBeTruthy();
});

it('forgets pending recovery intent when a shared channel is removed', async () => {
  await stage();
  expect(
    app.prepare("SELECT value FROM sync_state WHERE key = 'restore:family-share'").get(),
  ).toBeTruthy();
  forgetChannel('family-share');
  expect(
    app.prepare("SELECT value FROM sync_state WHERE key = 'restore:family-share'").get(),
  ).toBeUndefined();
});

it('discards recovery intent superseded by a later edit', async () => {
  await stage();
  app.prepare("UPDATE transactions SET amount = 29 WHERE id = 'lunch'").run();
  app.prepare("UPDATE sync_outbox SET seq = seq + 1000 WHERE row_id = 'lunch'").run();
  await engine.syncNow();
  expect(cloudRow('lunch').amount).toBe(29);
  expect(
    app.prepare("SELECT value FROM sync_state WHERE key = 'restore:family-share'").get()?.value ??
      null,
  ).toBeNull();
});
