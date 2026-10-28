import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import { applyMigrations } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';

// Real SQL against real SQLite: the Cloud Sync migrations (072, 074) on the
// upgrade paths phones actually take.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('~/lib/db/normalizeCurrencies', () => ({ normalizeCurrencyColumns: jest.fn() }));
jest.mock('~/lib/db/normalizeIcons', () => ({ normalizeIconColumns: jest.fn() }));

const MIGRATIONS_DIR = join(__dirname, '../../lib/db/migrations');

function loadMigrations(keep: (version: number) => boolean = () => true): DbMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.+\.ts$/.test(file))
    .sort()
    .map((file) => (require(join(MIGRATIONS_DIR, file)) as { default: DbMigration }).default)
    .filter((migration) => keep(migration.version));
}

function openDatabase() {
  const connection = new DatabaseSync(':memory:');
  const db = {
    execSync: (sql: string) => connection.exec(sql),
    getAllSync: (sql: string) => connection.prepare(sql).all(),
    getFirstSync: (sql: string) => connection.prepare(sql).get() ?? null,
    runSync: (sql: string) => connection.prepare(sql).run(),
    withTransactionSync: (task: () => void) => {
      connection.exec('BEGIN');
      try {
        task();
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
  const all = (sql: string) => connection.prepare(sql).all() as Record<string, unknown>[];
  const columns = (table: string) =>
    all(`PRAGMA table_info(${table})`)
      .map((row) => row.name)
      .sort();
  return { db, connection, all, columns };
}

function expectCloudSyncSchema(harness: ReturnType<typeof openDatabase>) {
  expect(harness.columns('sync_outbox')).toEqual(['row_id', 'seq', 'table_name']);
  expect(harness.columns('sync_row_meta')).toEqual(['channel', 'rev', 'row_id', 'table_name']);
  expect(harness.columns('sync_media_pending')).toEqual(['channel', 'path']);
  expect(harness.columns('sync_media_missing')).toEqual(['attempts', 'channel', 'path']);
  expect(harness.columns('shared_ledgers')).toContain('share_id');
  expect(harness.all("SELECT value FROM sync_state WHERE key = 'applying'")).toEqual([
    { value: '0' },
  ]);
}

describe('Cloud Sync migrations', () => {
  let harness: ReturnType<typeof openDatabase>;
  afterEach(() => harness.connection.close());

  it('build the Cloud Sync tables on a fresh install', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    expectCloudSyncSchema(harness);
  });

  // Build 493 shipped 073 (ledgers) without 072, so those phones are at
  // version 73 and the runner never runs 072 on them.
  it('upgrade a phone that ran 073 before 072 existed', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations((version) => version !== 72 && version <= 73));
    expect(harness.all('PRAGMA user_version')).toEqual([{ user_version: 73 }]);

    expect(applyMigrations(harness.db, loadMigrations()).appliedVersions).toEqual([74]);
    expectCloudSyncSchema(harness);
  });

  it('keep queued image paths when 074 rekeys the queues by channel', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations((version) => version <= 73));
    harness.connection.exec(`
      INSERT INTO sync_media_pending (path) VALUES ('receipts/a.jpg');
      INSERT INTO sync_media_missing (path, attempts) VALUES ('receipts/b.jpg', 2);
    `);

    expect(applyMigrations(harness.db, loadMigrations()).appliedVersions).toEqual([74]);
    expectCloudSyncSchema(harness);
    expect(harness.all('SELECT path, channel FROM sync_media_pending')).toEqual([
      { path: 'receipts/a.jpg', channel: 'personal' },
    ]);
    expect(harness.all('SELECT path, channel, attempts FROM sync_media_missing')).toEqual([
      { path: 'receipts/b.jpg', channel: 'personal', attempts: 2 },
    ]);
  });
});
