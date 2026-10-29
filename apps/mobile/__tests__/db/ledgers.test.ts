import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  channelOfRow,
  deletePersonalLedgerRows,
} from '~/features/cloudSync/services/ledgerChannels';
import {
  clearDeferredLedgerDeletes,
  deferLedgerDelete,
  removeSharedLedger,
  saveSharedLedger,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { getSQLite } from '~/lib/db/client';
import { copyLedgerRows } from '~/lib/db/ledgerCopy';
import {
  DEFAULT_LEDGER_ID,
  getActiveLedgerId,
  setActiveLedgerId,
  withLedgerScope,
} from '~/lib/db/ledgerScope';
import migration075LedgersAndCloudSync from '~/lib/db/migrations/075_ledgers_and_cloud_sync';
import { applyMigrations } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { writeBudgetLines } from '~/lib/repositories/budgetLines';
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

describe('migration 075 (ledgers)', () => {
  let harness: ReturnType<typeof openDatabase>;
  afterEach(() => harness.connection.close());

  it('puts every existing row in the default ledger without touching it', () => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations(71));
    seedPreLedgerData(harness);
    const before = harness.all('SELECT * FROM transactions');

    expect(applyMigrations(harness.db, [migration075LedgersAndCloudSync]).appliedVersions).toEqual([
      75,
    ]);

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
    expect(() => migration075LedgersAndCloudSync.up(harness.db)).not.toThrow();
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

  it("sums balances from the open ledger's accounts only", () => {
    harness.connection.exec(`
      INSERT INTO accounts (id, ledger_id, name, type, currency, starting_balance, created_at, updated_at)
        VALUES ('work-bank', 'work', 'Bank', 'debit', 'USD', 100, '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, from_account_id, to_account_id, created_at, updated_at)
        VALUES ('top-up', 'work', 'transfer', 40, 'USD', '2026-10-27', 'work-bank', 'work-cash', '${NOW}', '${NOW}');
    `);
    const workAccounts = [
      { id: 'work-cash', type: 'debit', startingBalance: 0 },
      { id: 'work-bank', type: 'debit', startingBalance: 100 },
    ];
    const list = jest
      .spyOn(accountsRepository, 'list')
      .mockReturnValue(workAccounts as ReturnType<typeof accountsRepository.list>);

    const balances = accountsRepository.getBalances();
    list.mockRestore();

    expect(balances.map((b) => [b.accountId, b.balance])).toEqual([
      ['work-cash', -80],
      ['work-bank', 60],
    ]);
  });

  it('copies a whole ledger with every reference following the copy', () => {
    harness.connection.exec(`
      INSERT INTO ledgers (id, name, created_at, updated_at) VALUES ('copy', 'Copy', '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, account_id, deleted_at, created_at, updated_at)
        VALUES ('gone', 'work', 'expense', 5, 'USD', '2026-10-27', 'work-cash', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO albums (id, ledger_id, name, created_at, updated_at) VALUES ('trip', 'work', 'Trip', '${NOW}', '${NOW}');
      -- An album still listing a deleted entry: the join must be left out, not nulled.
      INSERT INTO album_transactions (id, album_id, transaction_id, created_at, updated_at)
        VALUES ('trip-gone', 'trip', 'gone', '${NOW}', '${NOW}'), ('trip-taxi', 'trip', 'taxi', '${NOW}', '${NOW}');
      -- A deleted budget period is a tombstone and comes along.
      INSERT INTO monthly_budgets (id, ledger_id, period, month, total_amount, deleted_at, created_at, updated_at)
        VALUES ('work-sep', 'work', 'month', '2026-09', 100, '${NOW}', '${NOW}', '${NOW}');
    `);
    let n = 0;
    const copied = copyLedgerRows(harness.db, 'work', 'copy', () => `c${++n}`, NOW);

    // Cash, taxi, hotel, taxi's split, the album, its taxi join and the
    // budget tombstone; not the deleted entry, its album join, nor lunch's split.
    expect(copied).toBe(7);
    expect(
      harness.all(
        `SELECT a.transaction_id FROM album_transactions a JOIN albums b ON b.id = a.album_id WHERE b.ledger_id = 'copy'`,
      ),
    ).toEqual([{ transaction_id: 'c2' }]);
    expect(
      harness.all(`SELECT month, deleted_at FROM monthly_budgets WHERE ledger_id = 'copy'`),
    ).toEqual([{ month: '2026-09', deleted_at: NOW }]);
    const accounts = harness.all(`SELECT id, name FROM accounts WHERE ledger_id = 'copy'`);
    expect(accounts).toEqual([{ id: 'c1', name: 'Cash' }]);
    const transactions = harness.all(
      `SELECT id, account_id, amount FROM transactions WHERE ledger_id = 'copy' ORDER BY amount`,
    );
    expect(transactions).toEqual([
      { id: 'c2', account_id: 'c1', amount: 30 },
      { id: 'c3', account_id: 'c1', amount: 90 },
    ]);
    expect(
      harness.all(
        `SELECT transaction_id, amount FROM transaction_splits WHERE transaction_id IN ('c2', 'c3')`,
      ),
    ).toEqual([{ transaction_id: 'c2', amount: 15 }]);
    // The source is untouched.
    expect(ledgersRepository.entryCounts()).toEqual({ default: 1, work: 2, copy: 2 });
  });

  it('resets every ledger of the user but keeps the shared ones', () => {
    saveSharedLedger({
      ledgerId: 'work',
      shareId: 'share-1',
      role: 'member',
      name: 'Work',
      ownerName: 'Sam',
      memberCount: 2,
      active: true,
    });
    try {
      deletePersonalLedgerRows();
    } finally {
      removeSharedLedger('work');
    }
    expect(harness.all('SELECT id FROM transactions ORDER BY id')).toEqual([
      { id: 'hotel' },
      { id: 'taxi' },
    ]);
    expect(harness.all('SELECT id FROM transaction_splits')).toEqual([{ id: 'taxi-split' }]);
    expect(harness.all('SELECT id FROM accounts')).toEqual([{ id: 'work-cash' }]);
    expect(harness.all('SELECT id FROM monthly_budgets')).toEqual([]);
    expect(harness.all('SELECT id FROM ledgers ORDER BY id')).toEqual([
      { id: 'default' },
      { id: 'work' },
    ]);
  });

  it('resets every ledger but the default one when nothing is shared', () => {
    deletePersonalLedgerRows();
    expect(harness.all('SELECT id FROM transactions')).toEqual([]);
    expect(harness.all('SELECT id FROM transaction_splits')).toEqual([]);
    expect(harness.all('SELECT id FROM ledgers')).toEqual([{ id: 'default' }]);
  });

  it("routes a removed member's open ledger nowhere until it is deleted", () => {
    const taxi = { id: 'taxi', ledger_id: 'work' };
    const split = { id: 'taxi-split', transaction_id: 'taxi' };
    expect(channelOfRow('transactions', taxi)).toBe('personal');
    deferLedgerDelete('work');
    try {
      expect(channelOfRow('transactions', taxi)).toBe('none');
      expect(channelOfRow('transaction_splits', split)).toBe('none');
      expect(channelOfRow('transactions', { id: 'lunch', ledger_id: 'default' })).toBe('personal');
    } finally {
      clearDeferredLedgerDeletes(['work']);
    }
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

  it('leaves a shared ledger as it is: other people may have changed it since', async () => {
    addWorkLedger();
    const backup = await buildBackupData();
    saveSharedLedger({
      ledgerId: 'work',
      shareId: 'share-1',
      role: 'member',
      name: 'Work',
      ownerName: 'Sam',
      memberCount: 2,
      active: true,
    });
    try {
      harness.connection.exec(`
        UPDATE transactions SET amount = 35 WHERE id = 'taxi';
        UPDATE transaction_splits SET amount = 20 WHERE id = 'taxi-split';
        INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at)
          VALUES ('dinner', 'work', 'expense', 50, 'USD', '2026-10-28', '${NOW}', '${NOW}');
        DELETE FROM transactions WHERE id = 'lunch';
      `);

      expect(applyBackupData(backup).success).toBe(true);
      expect(harness.all('SELECT id, ledger_id, amount FROM transactions ORDER BY id')).toEqual([
        { id: 'dinner', ledger_id: 'work', amount: 50 },
        { id: 'lunch', ledger_id: 'default', amount: 12 },
        { id: 'taxi', ledger_id: 'work', amount: 35 },
      ]);
      expect(harness.all('SELECT id, amount FROM transaction_splits')).toEqual([
        { id: 'taxi-split', amount: 20 },
      ]);
      expect(harness.all("SELECT name FROM ledgers WHERE id = 'work'")).toEqual([{ name: 'Work' }]);
    } finally {
      removeSharedLedger('work');
    }
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

describe('budget lines', () => {
  let harness: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    harness = openDatabase();
    applyMigrations(harness.db, loadMigrations());
    seedPreLedgerData(harness);
    harness.connection.exec(`
      INSERT INTO monthly_budget_categories (id, budget_id, category_id, amount, created_at, updated_at)
        VALUES ('legacy', 'oct', 'food', 100, '${NOW}', '${NOW}');
    `);
    (getSQLite as jest.Mock).mockReturnValue(harness.db);
  });
  afterEach(() => harness.connection.close());

  const live = () =>
    harness.all(
      'SELECT id, amount FROM monthly_budget_categories WHERE deleted_at IS NULL ORDER BY id',
    );

  it('keeps one line per category when two phones edit the same budget', () => {
    // Each phone's edit, as it reaches the other: the same line ids.
    writeBudgetLines(
      'monthly_budget_categories',
      'oct',
      [{ categoryId: 'food', amount: 150 }],
      NOW,
    );
    writeBudgetLines(
      'monthly_budget_categories',
      'oct',
      [
        { categoryId: 'food', amount: 200 },
        { categoryId: 'rent', amount: 900 },
      ],
      NOW,
    );
    expect(live()).toEqual([
      { id: 'oct:food', amount: 200 },
      { id: 'oct:rent', amount: 900 },
    ]);
  });

  it('retires lines left out, and brings one back when it returns', () => {
    writeBudgetLines(
      'monthly_budget_categories',
      'oct',
      [{ categoryId: 'food', amount: 150 }],
      NOW,
    );
    writeBudgetLines('monthly_budget_categories', 'oct', [], NOW);
    expect(live()).toEqual([]);
    writeBudgetLines('monthly_budget_categories', 'oct', [{ categoryId: 'food', amount: 80 }], NOW);
    expect(live()).toEqual([{ id: 'oct:food', amount: 80 }]);
  });
});
