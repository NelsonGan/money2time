import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync } from 'node:sqlite';

import { getSQLite } from '~/lib/db/client';
import migration063RetireSimpleMode from '~/lib/db/migrations/063_retire_simple_mode';
import { applyMigrations } from '~/lib/db/migrations/runner';
import { applyBackupData, type BackupData } from '~/services/dataManagementService';

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system/next', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('~/services/userAssets', () => ({ restoreUserAssetsFromBackup: jest.fn() }));
jest.mock('~/services/userAssetGc', () => ({ runUserAssetGc: jest.fn() }));
jest.mock('~/lib/db/normalizeCurrencies', () => ({ normalizeCurrencyColumns: jest.fn() }));
jest.mock('~/lib/db/normalizeIcons', () => ({ normalizeIconColumns: jest.fn() }));

// Execute the production SQL against real SQLite. The adapter exposes the
// synchronous Expo methods, without requiring an emulator or a native Jest env.
function fixture(
  mode = 'simple',
  prefs: string | null = '{"defaultAccountId":"cash","defaultCurrency":"USD","custom":42}',
) {
  const connection = new DatabaseSync(':memory:');
  connection.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA user_version = 62;
    CREATE TABLE settings (id TEXT PRIMARY KEY, user_mode TEXT DEFAULT 'power',
      quick_entry_prefs_json TEXT, app_user_id TEXT, locale TEXT, onboarding_completed INTEGER);
    CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, currency TEXT,
      starting_balance REAL, include_in_totals INTEGER, sort_order INTEGER, deleted_at TEXT);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id),
      from_account_id TEXT REFERENCES accounts(id), to_account_id TEXT REFERENCES accounts(id),
      type TEXT, amount REAL, currency TEXT, reporting_amount REAL, fx_rate REAL, deleted_at TEXT);
    CREATE TABLE recurring_rules (id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id),
      amount REAL, next_run_date TEXT);
    CREATE TABLE transaction_splits (id TEXT PRIMARY KEY, transaction_id TEXT REFERENCES transactions(id),
      paid_transaction_id TEXT REFERENCES transactions(id));
    CREATE TABLE albums (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE album_transactions (id TEXT PRIMARY KEY, album_id TEXT REFERENCES albums(id),
      transaction_id TEXT REFERENCES transactions(id));
    CREATE TABLE receipt_splits (id TEXT PRIMARY KEY, transaction_id TEXT REFERENCES transactions(id));
    CREATE TABLE receipt_split_items (id TEXT PRIMARY KEY, receipt_split_id TEXT REFERENCES receipt_splits(id));
    CREATE TABLE receipt_split_item_shares (id TEXT PRIMARY KEY, item_id TEXT REFERENCES receipt_split_items(id));
    CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE account_groups (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE monthly_wage_settings (id TEXT PRIMARY KEY, wage_amount REAL);
    CREATE TABLE exchange_rates (id TEXT PRIMARY KEY, rate REAL);
    CREATE TABLE items (id TEXT PRIMARY KEY, purchase_price REAL);
    CREATE TABLE budget_templates (id TEXT PRIMARY KEY, total_amount REAL);
    CREATE TABLE budget_template_categories (id TEXT PRIMARY KEY, template_id TEXT REFERENCES budget_templates(id));
    CREATE TABLE monthly_budgets (id TEXT PRIMARY KEY, total_amount REAL);
    CREATE TABLE monthly_budget_categories (id TEXT PRIMARY KEY, budget_id TEXT REFERENCES monthly_budgets(id));
    INSERT INTO accounts VALUES ('cash', 'Cash', 'USD', 400, 1, 0, NULL),
      ('wallet', 'Simple Wallet', 'MYR', 123.45, 1, 1, NULL),
      ('deleted-wallet', 'Simple Wallet', 'MYR', 20, 0, 0, '2026-08-01');
    INSERT INTO transactions VALUES
      ('coffee', 'wallet', NULL, NULL, 'expense', 5, 'MYR', 5, 1, NULL),
      ('pay', 'wallet', NULL, NULL, 'income', 100, 'MYR', 100, 1, NULL),
      ('transfer', NULL, 'wallet', 'cash', 'transfer', 10, 'MYR', 10, 1, NULL),
      ('foreign', 'cash', NULL, NULL, 'expense', 7, 'USD', 30.8, 4.4, NULL),
      ('deleted', 'deleted-wallet', NULL, NULL, 'expense', 3, 'MYR', 3, 1, '2026-08-01');
    INSERT INTO recurring_rules VALUES ('rent', 'wallet', 70, '2026-10-01');
    INSERT INTO transaction_splits VALUES ('split', 'coffee', 'transfer');
    INSERT INTO albums VALUES ('trip', 'Holiday');
    INSERT INTO album_transactions VALUES ('album-coffee', 'trip', 'coffee');
    INSERT INTO receipt_splits VALUES ('receipt', 'coffee');
    INSERT INTO receipt_split_items VALUES ('item', 'receipt');
    INSERT INTO receipt_split_item_shares VALUES ('share', 'item');
    INSERT INTO categories VALUES ('food', 'Food');
    INSERT INTO account_groups VALUES ('bank', 'Bank');
    INSERT INTO monthly_wage_settings VALUES ('wage', 5000);
    INSERT INTO exchange_rates VALUES ('USD-MYR', 4.4);
    INSERT INTO items VALUES ('phone', 2000);
    INSERT INTO budget_templates VALUES ('template', 1000);
    INSERT INTO budget_template_categories VALUES ('allocation', 'template');
    INSERT INTO monthly_budgets VALUES ('budget', 1000);
    INSERT INTO monthly_budget_categories VALUES ('line', 'budget');
  `);
  connection
    .prepare('INSERT INTO settings VALUES (?, ?, ?, ?, ?, ?)')
    .run('primary', mode, prefs, 'installation-id', 'ms', 1);
  const db = {
    execSync: (sql: string) => connection.exec(sql),
    getAllSync: (sql: string, ...params: (string | number | null)[]) =>
      connection.prepare(sql).all(...params),
    getFirstSync: (sql: string, ...params: (string | number | null)[]) =>
      connection.prepare(sql).get(...params) ?? null,
    runSync: (sql: string, ...params: (string | number | null | (string | number | null)[])[]) =>
      connection.prepare(sql).run(...params.flat()),
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
  const snapshot = () =>
    Object.fromEntries(
      connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map(({ name }) => [name, connection.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]),
    );
  return { db, connection, snapshot };
}

describe('retiring simple mode', () => {
  let harness: ReturnType<typeof fixture>;
  afterEach(() => harness?.connection.close());

  it('converts an upgrade without changing any account, amount, ID, link, or other setting', () => {
    harness = fixture();
    const before = harness.snapshot();
    const result = applyMigrations(harness.db, [migration063RetireSimpleMode]);
    expect(result.appliedVersions).toEqual([63]);
    const after = harness.snapshot();
    const { settings: beforeSettings, ...beforeData } = before;
    const { settings: afterSettings, ...afterData } = after;
    expect(afterData).toEqual(beforeData);
    expect(afterSettings).toEqual([
      {
        ...beforeSettings[0],
        user_mode: 'power',
        quick_entry_prefs_json: '{"defaultAccountId":"wallet","defaultCurrency":"USD","custom":42}',
      },
    ]);
    expect(harness.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('is idempotent and preserves a new default chosen after conversion', () => {
    harness = fixture();
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    harness.db.runSync(
      'UPDATE settings SET quick_entry_prefs_json = ?',
      '{"defaultAccountId":"cash"}',
    );
    const before = harness.snapshot();
    migration063RetireSimpleMode.up(harness.db);
    expect(harness.snapshot()).toEqual(before);
  });

  it('leaves existing power users and their preferences unchanged', () => {
    harness = fixture('power');
    const before = harness.snapshot();
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    expect(harness.snapshot()).toEqual(before);
  });

  it('converts the imported-account case without creating or reviving a wallet', () => {
    harness = fixture();
    harness.db.execSync("UPDATE accounts SET name = 'Imported Cash' WHERE id = 'wallet'");
    const before = harness.snapshot();
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    expect(harness.snapshot()).toEqual({
      ...before,
      settings: [{ ...before.settings[0], user_mode: 'power' }],
    });
  });

  it('preserves an installation whose accounts are all deleted', () => {
    harness = fixture();
    harness.db.execSync("UPDATE accounts SET deleted_at = '2026-08-01'");
    const before = harness.snapshot();
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    expect(harness.snapshot()).toEqual({
      ...before,
      settings: [{ ...before.settings[0], user_mode: 'power' }],
    });
  });

  it('accepts a fresh database before the settings row has been seeded', () => {
    harness = fixture();
    harness.db.execSync('DELETE FROM settings');
    const before = harness.snapshot();
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    expect(harness.snapshot()).toEqual(before);
  });

  it.each([null, '{}'])(
    'keeps the old wallet as the default with empty preferences (%s)',
    (prefs) => {
      harness = fixture('simple', prefs);
      applyMigrations(harness.db, [migration063RetireSimpleMode]);
      expect(harness.snapshot().settings[0].quick_entry_prefs_json).toBe(
        '{"defaultAccountId":"wallet"}',
      );
    },
  );

  it.each(['broken json', '[]', 'null'])(
    'does not fail an upgrade or discard malformed preferences (%s)',
    (prefs) => {
      harness = fixture('simple', prefs);
      applyMigrations(harness.db, [migration063RetireSimpleMode]);
      expect(harness.snapshot().settings[0]).toMatchObject({
        user_mode: 'power',
        quick_entry_prefs_json: prefs,
      });
    },
  );

  it('rolls back the conversion and version together on failure, then retries safely', () => {
    harness = fixture();
    harness.db.execSync(
      "CREATE TRIGGER fail_upgrade BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
    const before = harness.snapshot();
    expect(() => applyMigrations(harness.db, [migration063RetireSimpleMode])).toThrow(
      'test failure',
    );
    expect(harness.snapshot()).toEqual(before);
    expect(harness.db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: 62 });
    harness.db.execSync('DROP TRIGGER fail_upgrade');
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    expect(harness.snapshot().settings[0].user_mode).toBe('power');
  });

  it('converts a restored old backup even when migration 63 already ran', () => {
    harness = fixture();
    const oldData = harness.snapshot();
    const backup = {
      version: 3,
      exportedAt: '2026-09-01',
      tables: oldData,
    } as unknown as BackupData;
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    (getSQLite as jest.Mock).mockReturnValue(harness.db);
    expect(applyBackupData(backup)).toEqual({ canceled: false, success: true });
    const { settings, ...data } = harness.snapshot();
    const { settings: oldSettings, ...oldFinancialData } = oldData;
    expect(data).toEqual(oldFinancialData);
    expect(settings[0]).toEqual({
      ...oldSettings[0],
      user_mode: 'power',
      quick_entry_prefs_json: '{"defaultAccountId":"wallet","defaultCurrency":"USD","custom":42}',
    });
    expect(harness.db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: 63 });
    expect(harness.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rolls back an old-backup restore if conversion fails', () => {
    harness = fixture();
    const backup = {
      version: 3,
      exportedAt: '2026-09-01',
      tables: harness.snapshot(),
    } as unknown as BackupData;
    applyMigrations(harness.db, [migration063RetireSimpleMode]);
    harness.db.execSync("UPDATE accounts SET starting_balance = 999 WHERE id = 'wallet'");
    harness.db.execSync(
      "CREATE TRIGGER fail_restore BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT, 'test restore failure'); END",
    );
    const before = harness.snapshot();
    (getSQLite as jest.Mock).mockReturnValue(harness.db);
    expect(applyBackupData(backup)).toMatchObject({
      success: false,
      error: expect.any(String),
    });
    expect(harness.snapshot()).toEqual(before);
    expect(harness.db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: 63 });
  });
});
