import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import { getSQLite } from '~/lib/db/client';
import {
  DEFAULT_LEDGER_ID,
  getActiveLedgerId,
  setActiveLedgerId,
  withLedgerScope,
} from '~/lib/db/ledgerScope';
import migration073Ledgers from '~/lib/db/migrations/073_ledgers';
import { applyMigrations } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { applyBackupData, buildBackupData } from '~/services/dataManagementService';

// Real SQL against real SQLite: every app migration, then the ledger code's
// raw statements. Drizzle is mocked in this suite, so the Drizzle-built
// repository queries are covered on the device instead.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('~/services/resetAutomationCaptureData', () => ({
  resetAutomationCaptureData: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system/next', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));
jest.mock('~/services/userAssets', () => ({
  collectUserAssetsForBackup: jest.fn(async () => [
    { path: 'receipts/taxi.jpg', base64: 'taxi' },
    { path: 'receipts/lunch.jpg', base64: 'lunch' },
  ]),
  assetRelativePathFromRef: (ref?: string | null) => ref ?? null,
  restoreUserAssetsFromBackup: jest.fn(),
}));
jest.mock('~/services/userAssetGc', () => ({ runUserAssetGc: jest.fn() }));
jest.mock('~/lib/db/normalizeCurrencies', () => ({ normalizeCurrencyColumns: jest.fn() }));
jest.mock('~/lib/db/normalizeIcons', () => ({ normalizeIconColumns: jest.fn() }));

const MIGRATIONS_DIR = join(__dirname, '../../lib/db/migrations');

function loadMigrations(upTo = Infinity): DbMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.+\.ts$/.test(file))
    .sort()
    .map((file) => {
      const module = require(join(MIGRATIONS_DIR, file)) as { default: DbMigration };
      return module.default;
    })
    .filter((migration) => migration.version <= upTo);
}

type Param = string | number | null;

/** The synchronous expo-sqlite surface the app uses, over node:sqlite. */
function openDatabase() {
  const connection = new DatabaseSync(':memory:');
  const flat = (params: unknown[]) => params.flat() as Param[];
  const db = {
    execSync: (sql: string) => connection.exec(sql),
    getAllSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).all(...flat(params)),
    getFirstSync: (sql: string, ...params: unknown[]) =>
      connection.prepare(sql).get(...flat(params)) ?? null,
    runSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).run(...flat(params)),
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
  const all = (sql: string, ...params: Param[]) =>
    connection.prepare(sql).all(...params) as Record<string, unknown>[];
  return { db, connection, all };
}

const NOW = '2026-10-28T00:00:00.000Z';

function seedPreLedgerData(harness: ReturnType<typeof openDatabase>) {
  harness.connection.exec(`
    INSERT INTO settings (id, app_user_id, created_at, updated_at) VALUES ('primary', 'user-1', '${NOW}', '${NOW}');
    INSERT INTO accounts (id, name, type, currency, starting_balance, created_at, updated_at)
      VALUES ('cash', 'Cash', 'debit', 'MYR', 0, '${NOW}', '${NOW}');
    INSERT INTO categories (id, name, type, icon, created_at, updated_at)
      VALUES ('food', 'Food', 'expense', 'meal', '${NOW}', '${NOW}');
    INSERT INTO transactions (id, type, amount, currency, date, account_id, category_id, created_at, updated_at)
      VALUES ('lunch', 'expense', 12, 'MYR', '2026-10-27', 'cash', 'food', '${NOW}', '${NOW}');
    INSERT INTO monthly_budgets (id, period, month, total_amount, created_at, updated_at)
      VALUES ('oct', 'month', '2026-10', 500, '${NOW}', '${NOW}');
  `);
}

describe('migration 073 (ledgers)', () => {
  let harness: ReturnType<typeof openDatabase>;
  afterEach(() => harness.connection.close());

  it('puts every existing row in the default ledger without touching it', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations(71));
    seedPreLedgerData(harness);
    const before = harness.all('SELECT * FROM transactions');

    expect(applyMigrations(harness.db, [migration073Ledgers]).appliedVersions).toEqual([73]);

    const after = harness.all('SELECT * FROM transactions');
    expect(after).toEqual(before.map((row) => ({ ...row, ledger_id: DEFAULT_LEDGER_ID })));
    expect(harness.all('SELECT ledger_id FROM accounts')).toEqual([{ ledger_id: 'default' }]);
    expect(harness.all('SELECT id, name, currency_code FROM ledgers')).toEqual([
      { id: 'default', name: null, currency_code: null },
    ]);
    expect(harness.all('SELECT active_ledger_id FROM settings')).toEqual([
      { active_ledger_id: null },
    ]);
  });

  it('can be replayed', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    expect(() => migration073Ledgers.up(harness.db)).not.toThrow();
    expect(harness.all('SELECT id FROM ledgers')).toEqual([{ id: 'default' }]);
  });

  it('keeps one live budget per period in each ledger, not across ledgers', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    seedPreLedgerData(harness);
    const insertBudget = (id: string, ledgerId: string) =>
      harness.connection
        .prepare(
          `INSERT INTO monthly_budgets (id, ledger_id, period, month, total_amount, created_at, updated_at)
           VALUES (?, ?, 'month', '2026-10', 100, ?, ?)`,
        )
        .run(id, ledgerId, NOW, NOW);

    expect(() => insertBudget('work-oct', 'work')).not.toThrow();
    expect(() => insertBudget('second-oct', DEFAULT_LEDGER_ID)).toThrow(/UNIQUE/);
  });
});

describe('ledger scope', () => {
  afterEach(() => setActiveLedgerId(DEFAULT_LEDGER_ID));

  it('falls back to the default ledger for an empty id', () => {
    setActiveLedgerId('work');
    setActiveLedgerId(null);
    expect(getActiveLedgerId()).toBe(DEFAULT_LEDGER_ID);
  });

  it('puts the previous ledger back after scoped work, even when it throws', () => {
    setActiveLedgerId('work');
    expect(withLedgerScope('side', () => getActiveLedgerId())).toBe('side');
    expect(() =>
      withLedgerScope('side', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(getActiveLedgerId()).toBe('work');
  });
});

describe('ledgersRepository on SQLite', () => {
  let harness: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    seedPreLedgerData(harness);
    harness.connection.exec(`
      INSERT INTO ledgers (id, name, currency_code, created_at, updated_at)
        VALUES ('work', 'Work', 'USD', '${NOW}', '${NOW}');
      INSERT INTO accounts (id, ledger_id, name, type, currency, starting_balance, created_at, updated_at)
        VALUES ('work-cash', 'work', 'Cash', 'debit', 'USD', 0, '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, account_id, created_at, updated_at)
        VALUES ('taxi', 'work', 'expense', 30, 'USD', '2026-10-27', 'work-cash', '${NOW}', '${NOW}'),
               ('hotel', 'work', 'expense', 90, 'USD', '2026-10-27', 'work-cash', '${NOW}', '${NOW}');
      INSERT INTO transaction_splits (id, transaction_id, amount, created_at, updated_at)
        VALUES ('taxi-split', 'taxi', 15, '${NOW}', '${NOW}'),
               ('lunch-split', 'lunch', 6, '${NOW}', '${NOW}');
    `);
    (getSQLite as jest.Mock).mockReturnValue(harness.db);
  });
  afterEach(() => harness.connection.close());

  it('counts live entries per ledger in one pass', () => {
    expect(ledgersRepository.entryCounts()).toEqual({ default: 1, work: 2 });
  });

  it('deletes a ledger with its rows and their children, and nothing else', () => {
    ledgersRepository.softDelete('work');

    const live = (table: string) =>
      harness.all(`SELECT id FROM ${table} WHERE deleted_at IS NULL ORDER BY id`).map((r) => r.id);
    expect(live('ledgers')).toEqual(['default']);
    expect(live('transactions')).toEqual(['lunch']);
    expect(live('accounts')).toEqual(['cash']);
    expect(live('transaction_splits')).toEqual(['lunch-split']);
    expect(ledgersRepository.entryCounts()).toEqual({ default: 1 });
  });

  it('never deletes the default ledger', () => {
    expect(() => ledgersRepository.softDelete(DEFAULT_LEDGER_ID)).toThrow();
    expect(harness.all('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL')).toEqual([
      { n: 3 },
    ]);
  });
});

describe('backup and restore across ledgers', () => {
  let harness: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    seedPreLedgerData(harness);
    (getSQLite as jest.Mock).mockReturnValue(harness.db);
  });
  afterEach(() => {
    harness.connection.close();
    setActiveLedgerId(DEFAULT_LEDGER_ID);
  });

  function addWorkLedger() {
    harness.connection.exec(`
      INSERT INTO ledgers (id, name, currency_code, currency_symbol, prefs_json, created_at, updated_at)
        VALUES ('work', 'Work', 'USD', '$', '{"defaultPaybackAccountId":"work-bank"}', '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, receipt_uri, created_at, updated_at)
        VALUES ('taxi', 'work', 'expense', 30, 'USD', '2026-10-27', 'receipts/taxi.jpg', '${NOW}', '${NOW}');
      UPDATE transactions SET receipt_uri = 'receipts/lunch.jpg' WHERE id = 'lunch';
      UPDATE settings SET default_payback_account_id = 'main-bank';
      INSERT INTO transaction_splits (id, transaction_id, amount, created_at, updated_at)
        VALUES ('taxi-split', 'taxi', 15, '${NOW}', '${NOW}');
      UPDATE settings SET active_ledger_id = 'work';
    `);
  }

  it('stays version 3 while there is only the default ledger', async () => {
    const backup = await buildBackupData();
    expect(backup.version).toBe(3);
    expect(backup.tables.ledgers).toHaveLength(1);
  });

  it('is version 4 with more than one ledger, so older apps refuse it', async () => {
    addWorkLedger();
    const backup = await buildBackupData();
    expect(backup.version).toBe(4);
    expect(backup.tables.transactions.map((row) => row.ledger_id).sort()).toEqual([
      'default',
      'work',
    ]);
  });

  it('gives the Web Dashboard the open ledger only, in its currency', async () => {
    addWorkLedger();
    setActiveLedgerId('work');
    const backup = await buildBackupData({ openLedgerOnly: true });
    expect(backup.version).toBe(3);
    expect(backup.tables.transactions.map((row) => row.id)).toEqual(['taxi']);
    expect(backup.tables.transaction_splits.map((row) => row.id)).toEqual(['taxi-split']);
    expect(backup.tables.accounts).toEqual([]);
    expect(backup.tables.settings[0]).toMatchObject({
      currency_code: 'USD',
      currency_symbol: '$',
      default_payback_account_id: 'work-bank',
    });
    expect(backup.userAssets?.map((asset) => asset.path)).toEqual(['receipts/taxi.jpg']);
  });

  it('restores every ledger and opens the default one', async () => {
    addWorkLedger();
    const backup = await buildBackupData();
    harness.connection.exec('DELETE FROM transactions; DELETE FROM ledgers;');

    expect(applyBackupData(backup).success).toBe(true);
    expect(harness.all('SELECT id, ledger_id FROM transactions ORDER BY id')).toEqual([
      { id: 'lunch', ledger_id: 'default' },
      { id: 'taxi', ledger_id: 'work' },
    ]);
    expect(harness.all('SELECT id FROM ledgers ORDER BY id')).toEqual([
      { id: 'default' },
      { id: 'work' },
    ]);
    expect(harness.all('SELECT active_ledger_id FROM settings')).toEqual([
      { active_ledger_id: null },
    ]);
  });

  it('restores a backup from before ledgers into the default ledger', async () => {
    const backup = await buildBackupData();
    delete backup.tables.ledgers;
    for (const rows of Object.values(backup.tables)) {
      for (const row of rows ?? []) delete row.ledger_id;
    }
    addWorkLedger();

    expect(applyBackupData(backup).success).toBe(true);
    expect(harness.all('SELECT id, ledger_id FROM transactions')).toEqual([
      { id: 'lunch', ledger_id: 'default' },
    ]);
    // Restoring replaces everything, the other ledgers included.
    expect(harness.all('SELECT id FROM ledgers')).toEqual([{ id: 'default' }]);
  });
});
