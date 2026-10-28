import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import migration075LedgersAndCloudSync from '~/lib/db/migrations/075_ledgers_and_cloud_sync';
import { applyMigrations } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';

import {
  migration072CloudSync,
  migration073Ledgers,
  migration074SharedLedgers,
} from './fixtures/shippedLedgerAndSyncMigrations';

// Real SQL against real SQLite: migration 075 on every schema a phone can have
// before it, including the ones builds 493 and 494 left behind.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('~/lib/db/normalizeCurrencies', () => ({ normalizeCurrencyColumns: jest.fn() }));
jest.mock('~/lib/db/normalizeIcons', () => ({ normalizeIconColumns: jest.fn() }));

const MIGRATIONS_DIR = join(__dirname, '../../lib/db/migrations');

function loadMigrations(upTo = Infinity): DbMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.+\.ts$/.test(file))
    .sort()
    .map((file) => (require(join(MIGRATIONS_DIR, file)) as { default: DbMigration }).default)
    .filter((migration) => migration.version <= upTo);
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
  return { db, connection, all };
}

type Harness = ReturnType<typeof openDatabase>;

/** Every table's columns, keys and indexes, without the CREATE text (which
 * differs between a table created whole and one altered into shape). */
function schemaOf(harness: Harness) {
  const tables = harness
    .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((row) => String(row.name));
  return Object.fromEntries(
    tables.map((table) => [
      table,
      {
        columns: harness.all(`PRAGMA table_info(${table})`),
        indexes: harness
          .all(`PRAGMA index_list(${table})`)
          .map((index) => ({
            name: index.name,
            unique: index.unique,
            partial: index.partial,
            columns: harness
              .all(`PRAGMA index_info(${String(index.name)})`)
              .map((column) => column.name),
          }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name))),
      },
    ]),
  );
}

function freshSchema() {
  const fresh = openDatabase();
  applyMigrations(fresh.db, loadMigrations());
  const schema = schemaOf(fresh);
  fresh.connection.close();
  return schema;
}

/** A phone on the last build before ledgers and Cloud Sync. */
function phoneAt71() {
  const harness = openDatabase();
  applyMigrations(harness.db, loadMigrations(71));
  return harness;
}

describe('migration 075 (ledgers and Cloud Sync)', () => {
  let harness: Harness;
  afterEach(() => harness.connection.close());

  it('builds the full schema on a fresh install', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    const schema = schemaOf(harness);
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining([
        'ledgers',
        'shared_ledgers',
        'sync_media_missing',
        'sync_media_pending',
        'sync_outbox',
        'sync_row_meta',
        'sync_state',
      ]),
    );
    expect(harness.all("SELECT value FROM sync_state WHERE key = 'applying'")).toEqual([
      { value: '0' },
    ]);
    expect(harness.all('SELECT id FROM ledgers')).toEqual([{ id: 'default' }]);
  });

  it('upgrades a phone from before ledgers and Cloud Sync', () => {
    harness = phoneAt71();
    expect(applyMigrations(harness.db, loadMigrations()).appliedVersions).toEqual([75]);
    expect(schemaOf(harness)).toEqual(freshSchema());
  });

  // Build 493 shipped 073 without 072. Build 494's 074 then failed on these
  // phones and rolled back, leaving them at 73 too.
  it('upgrades a phone that ran 073 but never 072 (build 493)', () => {
    harness = phoneAt71();
    applyMigrations(harness.db, [migration073Ledgers]);
    expect(() => applyMigrations(harness.db, [migration074SharedLedgers])).toThrow(
      'no such table: sync_row_meta',
    );

    expect(applyMigrations(harness.db, loadMigrations()).appliedVersions).toEqual([75]);
    expect(schemaOf(harness)).toEqual(freshSchema());
  });

  it('changes nothing on a phone that ran 072 to 074 (build 494)', () => {
    harness = phoneAt71();
    applyMigrations(harness.db, [
      migration072CloudSync,
      migration073Ledgers,
      migration074SharedLedgers,
    ]);
    harness.connection.exec(`
      INSERT INTO sync_row_meta (table_name, row_id, rev, channel) VALUES ('transactions', 't1', 'r1', 'share-1');
      INSERT INTO sync_media_pending (path, channel) VALUES ('receipts/a.jpg', 'share-1');
    `);

    expect(applyMigrations(harness.db, loadMigrations()).appliedVersions).toEqual([75]);
    expect(schemaOf(harness)).toEqual(freshSchema());
    expect(harness.all('SELECT row_id, channel FROM sync_row_meta')).toEqual([
      { row_id: 't1', channel: 'share-1' },
    ]);
    expect(harness.all('SELECT path, channel FROM sync_media_pending')).toEqual([
      { path: 'receipts/a.jpg', channel: 'share-1' },
    ]);
  });

  it('keys the queues of a phone that ran 072 only by channel, keeping their rows', () => {
    harness = phoneAt71();
    applyMigrations(harness.db, [migration072CloudSync]);
    harness.connection.exec(`
      INSERT INTO sync_row_meta (table_name, row_id, rev) VALUES ('transactions', 't1', 'r1');
      INSERT INTO sync_media_pending (path) VALUES ('receipts/a.jpg');
      INSERT INTO sync_media_missing (path, attempts) VALUES ('receipts/b.jpg', 2);
    `);

    expect(applyMigrations(harness.db, loadMigrations()).appliedVersions).toEqual([75]);
    expect(schemaOf(harness)).toEqual(freshSchema());
    expect(harness.all('SELECT row_id, channel FROM sync_row_meta')).toEqual([
      { row_id: 't1', channel: 'personal' },
    ]);
    expect(harness.all('SELECT path, channel FROM sync_media_pending')).toEqual([
      { path: 'receipts/a.jpg', channel: 'personal' },
    ]);
    expect(harness.all('SELECT path, channel, attempts FROM sync_media_missing')).toEqual([
      { path: 'receipts/b.jpg', channel: 'personal', attempts: 2 },
    ]);
  });

  it('can be replayed', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    const before = schemaOf(harness);
    expect(() => migration075LedgersAndCloudSync.up(harness.db)).not.toThrow();
    expect(schemaOf(harness)).toEqual(before);
  });
});
