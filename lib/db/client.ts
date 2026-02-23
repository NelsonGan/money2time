import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import {
  computeHourlyRates,
  getLocaleCurrencySymbol,
  monthKeyFromDateLocal,
} from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { monthlyWageSettingsTable, settingsTable } from './schema';
import { getDeviceLocale } from '~/lib/i18n';

const DB_NAME = 'money2time.db';
const SCHEMA_VERSION = 14;

let sqlite: SQLiteDatabase | null = null;
let initialized = false;

function migrateV1(db: SQLiteDatabase) {
  db.execSync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      account_group TEXT,
      credit_statement_day INTEGER,
      credit_due_day INTEGER,
      currency TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      starting_balance REAL NOT NULL DEFAULT 0,
      include_in_totals INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      date TEXT NOT NULL,
      account_id TEXT,
      from_account_id TEXT,
      to_account_id TEXT,
      category_id TEXT,
      note TEXT,
      recurrence_pattern TEXT NOT NULL DEFAULT 'none',
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      recurrence_end_date TEXT,
      recurrence_parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY NOT NULL,
      wage_type TEXT NOT NULL,
      wage_amount REAL NOT NULL DEFAULT 0,
      hours_per_week REAL NOT NULL DEFAULT 40,
      workdays_per_week INTEGER NOT NULL DEFAULT 5,
      commute_minutes_per_day INTEGER NOT NULL DEFAULT 0,
      true_hourly_rate REAL NOT NULL DEFAULT 0,
      currency_symbol TEXT NOT NULL DEFAULT '$',
      hour_rounding REAL NOT NULL DEFAULT 0.1,
      display_mode TEXT NOT NULL DEFAULT 'money',
      insights_prefs_json TEXT,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_from_account_id ON transactions(from_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id ON transactions(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
  `);
}

function migrateV2(db: SQLiteDatabase) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS monthly_wage_settings (
      id TEXT PRIMARY KEY NOT NULL,
      month TEXT NOT NULL,
      wage_type TEXT NOT NULL,
      wage_amount REAL NOT NULL,
      hours_worked_per_week REAL NOT NULL,
      workdays_per_week INTEGER NOT NULL,
      commute_minutes_per_workday INTEGER NOT NULL,
      base_hourly_rate REAL NOT NULL,
      true_hourly_rate REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_wage_month_unique ON monthly_wage_settings(month) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_monthly_wage_month ON monthly_wage_settings(month);
  `);
}

function migrateV3(db: SQLiteDatabase) {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(transactions)`);
  const hasPayee = columns.some((column) => column.name === 'payee');
  if (!hasPayee) return;

  db.execSync(`
    BEGIN TRANSACTION;

    CREATE TABLE IF NOT EXISTS transactions_new (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      date TEXT NOT NULL,
      account_id TEXT,
      from_account_id TEXT,
      to_account_id TEXT,
      category_id TEXT,
      note TEXT,
      recurrence_pattern TEXT NOT NULL DEFAULT 'none',
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      recurrence_end_date TEXT,
      recurrence_parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    INSERT INTO transactions_new (
      id, type, amount, currency, date, account_id, from_account_id, to_account_id, category_id, note, recurrence_pattern, recurrence_interval, recurrence_end_date, recurrence_parent_id, created_at, updated_at, deleted_at
    )
    SELECT
      id, type, amount, currency, date, account_id, from_account_id, to_account_id, category_id, note, 'none', 1, NULL, NULL, created_at, updated_at, deleted_at
    FROM transactions;

    DROP TABLE transactions;
    ALTER TABLE transactions_new RENAME TO transactions;

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_from_account_id ON transactions(from_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id ON transactions(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);

    COMMIT;
  `);
}

function migrateV4(db: SQLiteDatabase) {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(accounts)`);
  const hasAccountGroup = columns.some((column) => column.name === 'account_group');
  if (!hasAccountGroup) {
    db.execSync(`ALTER TABLE accounts ADD COLUMN account_group TEXT;`);
  }
}

function migrateV5(db: SQLiteDatabase) {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(accounts)`);
  const hasStatement = columns.some((column) => column.name === 'credit_statement_day');
  const hasDue = columns.some((column) => column.name === 'credit_due_day');
  if (!hasStatement) {
    db.execSync(`ALTER TABLE accounts ADD COLUMN credit_statement_day INTEGER;`);
  }
  if (!hasDue) {
    db.execSync(`ALTER TABLE accounts ADD COLUMN credit_due_day INTEGER;`);
  }
}

function migrateV6(db: SQLiteDatabase) {
  const accountCols = db.getAllSync<{ name: string }>(`PRAGMA table_info(accounts)`);
  const hasAccountSortOrder = accountCols.some((column) => column.name === 'sort_order');
  if (!hasAccountSortOrder) {
    db.execSync(`ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`);
  }

  const categoryCols = db.getAllSync<{ name: string }>(`PRAGMA table_info(categories)`);
  const hasCategorySortOrder = categoryCols.some((column) => column.name === 'sort_order');
  if (!hasCategorySortOrder) {
    db.execSync(`ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`);
  }

  const activeAccounts = db.getAllSync<{ id: string }>(
    `SELECT id FROM accounts WHERE deleted_at IS NULL ORDER BY datetime(created_at), id`,
  );
  activeAccounts.forEach((row, index) => {
    db.runSync(`UPDATE accounts SET sort_order = ? WHERE id = ?`, [index, row.id]);
  });

  const activeCategories = db.getAllSync<{ id: string }>(
    `SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY type, parent_id IS NOT NULL, datetime(created_at), id`,
  );
  activeCategories.forEach((row, index) => {
    db.runSync(`UPDATE categories SET sort_order = ? WHERE id = ?`, [index, row.id]);
  });
}

function migrateV7(db: SQLiteDatabase) {
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_active_date_desc
      ON transactions(date DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_type_date_desc
      ON transactions(type, date DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_account_date_desc
      ON transactions(account_id, date DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_from_account_date_desc
      ON transactions(from_account_id, date DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_to_account_date_desc
      ON transactions(to_account_id, date DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_category_date_desc
      ON transactions(category_id, date DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_accounts_active_sort_name
      ON accounts(sort_order, name)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_categories_active_type_sort_name
      ON categories(type, sort_order, name)
      WHERE deleted_at IS NULL;
  `);
}

function migrateV8(db: SQLiteDatabase) {
  const txCols = db.getAllSync<{ name: string }>(`PRAGMA table_info(transactions)`);
  const hasRecurrencePattern = txCols.some((column) => column.name === 'recurrence_pattern');
  const hasRecurrenceInterval = txCols.some((column) => column.name === 'recurrence_interval');
  const hasRecurrenceEndDate = txCols.some((column) => column.name === 'recurrence_end_date');
  const hasRecurrenceParentId = txCols.some((column) => column.name === 'recurrence_parent_id');

  if (!hasRecurrencePattern) {
    db.execSync(
      `ALTER TABLE transactions ADD COLUMN recurrence_pattern TEXT NOT NULL DEFAULT 'none';`,
    );
  }
  if (!hasRecurrenceInterval) {
    db.execSync(
      `ALTER TABLE transactions ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1;`,
    );
  }
  if (!hasRecurrenceEndDate) {
    db.execSync(`ALTER TABLE transactions ADD COLUMN recurrence_end_date TEXT;`);
  }
  if (!hasRecurrenceParentId) {
    db.execSync(`ALTER TABLE transactions ADD COLUMN recurrence_parent_id TEXT;`);
  }

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_active_recurrence_parent
      ON transactions(recurrence_parent_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_recurrence_pattern
      ON transactions(recurrence_pattern, date DESC)
      WHERE deleted_at IS NULL;
  `);
}

function migrateV9(db: SQLiteDatabase) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS account_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_account_groups_active_sort_name
      ON account_groups(sort_order, name)
      WHERE deleted_at IS NULL;
  `);

  const existing = db.getAllSync<{ name: string }>(
    `SELECT DISTINCT TRIM(account_group) as name
     FROM accounts
     WHERE deleted_at IS NULL AND account_group IS NOT NULL AND TRIM(account_group) <> ''
     ORDER BY name`,
  );
  const now = nowIso();
  existing.forEach((row, index) => {
    const name = (row.name ?? '').trim();
    if (!name) return;
    db.runSync(
      `INSERT OR IGNORE INTO account_groups (id, name, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [newId(), name, index, now, now],
    );
  });
}

function migrateV10(db: SQLiteDatabase) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS recurring_rules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      account_id TEXT,
      from_account_id TEXT,
      to_account_id TEXT,
      category_id TEXT,
      note TEXT,
      recurrence_pattern TEXT NOT NULL,
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      next_run_date TEXT NOT NULL,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next_run
      ON recurring_rules(next_run_date)
      WHERE deleted_at IS NULL AND is_active = 1;
  `);
}

function migrateV11(db: SQLiteDatabase) {
  const cols = db.getAllSync<{ name: string; notnull: number }>(
    `PRAGMA table_info(recurring_rules)`,
  );
  const hasFromAccountId = cols.some((column) => column.name === 'from_account_id');
  const hasToAccountId = cols.some((column) => column.name === 'to_account_id');
  const accountNotNull = cols.find((column) => column.name === 'account_id')?.notnull === 1;
  const categoryNotNull = cols.find((column) => column.name === 'category_id')?.notnull === 1;
  const needsRebuild = !hasFromAccountId || !hasToAccountId || accountNotNull || categoryNotNull;
  if (!needsRebuild) return;

  db.execSync(`
    BEGIN TRANSACTION;
    CREATE TABLE IF NOT EXISTS recurring_rules_new (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      account_id TEXT,
      from_account_id TEXT,
      to_account_id TEXT,
      category_id TEXT,
      note TEXT,
      recurrence_pattern TEXT NOT NULL,
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      next_run_date TEXT NOT NULL,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    INSERT INTO recurring_rules_new (
      id, name, type, amount, currency, account_id, from_account_id, to_account_id, category_id, note,
      recurrence_pattern, recurrence_interval, next_run_date, end_date, is_active, created_at, updated_at, deleted_at
    )
    SELECT
      id, name, type, amount, currency, account_id, NULL, NULL, category_id, note,
      recurrence_pattern, recurrence_interval, next_run_date, end_date, is_active, created_at, updated_at, deleted_at
    FROM recurring_rules;

    DROP TABLE recurring_rules;
    ALTER TABLE recurring_rules_new RENAME TO recurring_rules;

    CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next_run
      ON recurring_rules(next_run_date)
      WHERE deleted_at IS NULL AND is_active = 1;
    COMMIT;
  `);
}

function migrateV12(db: SQLiteDatabase) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(settings)`);
  const hasLocale = cols.some((column) => column.name === 'locale');
  if (!hasLocale) {
    db.execSync(`ALTER TABLE settings ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';`);
    db.runSync(`UPDATE settings SET locale = ? WHERE id = 'primary'`, [getDeviceLocale()]);
  }
}

function migrateV13(db: SQLiteDatabase) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(settings)`);
  const hasThemeMode = cols.some((column) => column.name === 'theme_mode');
  if (!hasThemeMode) {
    db.execSync(`ALTER TABLE settings ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system';`);
  }
}

function migrateV14(db: SQLiteDatabase) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(settings)`);
  const hasInsightsPrefsJson = cols.some((column) => column.name === 'insights_prefs_json');
  if (!hasInsightsPrefsJson) {
    db.execSync(`ALTER TABLE settings ADD COLUMN insights_prefs_json TEXT;`);
  }
}

function runMigrations(db: SQLiteDatabase) {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion < 1) {
    migrateV1(db);
  }
  if (currentVersion < 2) {
    migrateV2(db);
  }
  if (currentVersion < 3) {
    migrateV3(db);
  }
  if (currentVersion < 4) {
    migrateV4(db);
  }
  if (currentVersion < 5) {
    migrateV5(db);
  }
  if (currentVersion < 6) {
    migrateV6(db);
  }
  if (currentVersion < 7) {
    migrateV7(db);
  }
  if (currentVersion < 8) {
    migrateV8(db);
  }
  if (currentVersion < 9) {
    migrateV9(db);
  }
  if (currentVersion < 10) {
    migrateV10(db);
  }
  if (currentVersion < 11) {
    migrateV11(db);
  }
  if (currentVersion < 12) {
    migrateV12(db);
  }
  if (currentVersion < 13) {
    migrateV13(db);
  }
  if (currentVersion < 14) {
    migrateV14(db);
  }

  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return { isFreshDatabase: currentVersion === 0 };
}

function currentMonth() {
  return monthKeyFromDateLocal(new Date());
}

function seedOrCarryForwardMonthlyWage() {
  const db = getDb();
  const month = currentMonth();
  const now = nowIso();

  const existingCurrent = db
    .select()
    .from(monthlyWageSettingsTable)
    .where(
      and(eq(monthlyWageSettingsTable.month, month), isNull(monthlyWageSettingsTable.deletedAt)),
    )
    .get();
  if (existingCurrent) return;

  const latest = db
    .select()
    .from(monthlyWageSettingsTable)
    .where(isNull(monthlyWageSettingsTable.deletedAt))
    .orderBy(sql`${monthlyWageSettingsTable.month} desc`)
    .get();

  if (latest) {
    db.insert(monthlyWageSettingsTable)
      .values({
        id: newId(),
        month,
        wageType: latest.wageType,
        wageAmount: latest.wageAmount,
        hoursWorkedPerWeek: latest.hoursWorkedPerWeek,
        workdaysPerWeek: latest.workdaysPerWeek,
        commuteMinutesPerWorkday: latest.commuteMinutesPerWorkday,
        baseHourlyRate: latest.baseHourlyRate,
        trueHourlyRate: latest.trueHourlyRate,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    return;
  }

  const legacy = getSQLite().getFirstSync<{
    wage_type?: 'hourly' | 'monthly' | 'yearly';
    wage_amount?: number;
    hours_per_week?: number;
    workdays_per_week?: number;
    commute_minutes_per_day?: number;
  }>(
    `SELECT wage_type, wage_amount, hours_per_week, workdays_per_week, commute_minutes_per_day FROM settings WHERE id = 'primary' LIMIT 1`,
  );

  const config = {
    wageType: legacy?.wage_type ?? DEFAULT_WAGE_CONFIG.wageType,
    wageAmount: legacy?.wage_amount ?? DEFAULT_WAGE_CONFIG.wageAmount,
    hoursWorkedPerWeek: legacy?.hours_per_week ?? DEFAULT_WAGE_CONFIG.hoursWorkedPerWeek,
    workdaysPerWeek: legacy?.workdays_per_week ?? DEFAULT_WAGE_CONFIG.workdaysPerWeek,
    commuteMinutesPerWorkday:
      legacy?.commute_minutes_per_day ?? DEFAULT_WAGE_CONFIG.commuteMinutesPerWorkday,
  } as const;

  const rates = computeHourlyRates(config);
  db.insert(monthlyWageSettingsTable)
    .values({
      id: newId(),
      month,
      wageType: config.wageType,
      wageAmount: config.wageAmount,
      hoursWorkedPerWeek: config.hoursWorkedPerWeek,
      workdaysPerWeek: config.workdaysPerWeek,
      commuteMinutesPerWorkday: config.commuteMinutesPerWorkday,
      baseHourlyRate: rates.baseHourlyRate,
      trueHourlyRate: rates.trueHourlyRate,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();
}

function ensureCoreData() {
  const db = getDb();
  const now = nowIso();

  const settingsRow = db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.id, 'primary'), isNull(settingsTable.deletedAt)))
    .get();

  if (!settingsRow) {
    db.insert(settingsTable)
      .values({
        id: 'primary',
        wageType: DEFAULT_WAGE_CONFIG.wageType,
        wageAmount: DEFAULT_WAGE_CONFIG.wageAmount,
        hoursPerWeek: DEFAULT_WAGE_CONFIG.hoursWorkedPerWeek,
        workdaysPerWeek: DEFAULT_WAGE_CONFIG.workdaysPerWeek,
        commuteMinutesPerDay: DEFAULT_WAGE_CONFIG.commuteMinutesPerWorkday,
        trueHourlyRate: 0,
        locale: getDeviceLocale(),
        currencySymbol: getLocaleCurrencySymbol(),
        hourRounding: 0.1,
        displayMode: 'money',
        themeMode: 'system',
        insightsPrefsJson: null,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }

  seedOrCarryForwardMonthlyWage();
}

export function getSQLite(): SQLiteDatabase {
  if (!sqlite) {
    sqlite = openDatabaseSync(DB_NAME);
  }
  return sqlite;
}

export function getDb() {
  return drizzle(getSQLite());
}

export function initializeDatabase() {
  runMigrations(getSQLite());
  if (!initialized) {
    ensureCoreData();
    initialized = true;
    return;
  }
  // Keep essential records present on refresh/hot-reload without re-seeding starter data.
  ensureCoreData();
}
