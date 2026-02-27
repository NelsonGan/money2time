import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  DEFAULT_WAGE_CONFIG,
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
} from '~/constants/appDefaults';
import {
  computeHourlyRates,
  getLocaleCurrencySymbol,
  monthKeyFromDateLocal,
} from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';
import { categoriesTable, monthlyWageSettingsTable, settingsTable } from './schema';
import { getDeviceLocale } from '~/lib/i18n';

const DB_NAME = 'money2time.db';
const SCHEMA_VERSION = 3;
export const SIMPLE_WALLET_NAME = 'Simple Wallet';

let sqlite: SQLiteDatabase | null = null;
let initialized = false;

function migrateV1(db: SQLiteDatabase) {
  db.execSync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS account_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY NOT NULL,
      wage_type TEXT NOT NULL,
      wage_amount REAL NOT NULL DEFAULT 0,
      hours_per_week REAL NOT NULL DEFAULT 40,
      workdays_per_week INTEGER NOT NULL DEFAULT 5,
      commute_minutes_per_day INTEGER NOT NULL DEFAULT 0,
      true_hourly_rate REAL NOT NULL DEFAULT 0,
      locale TEXT NOT NULL DEFAULT 'en',
      currency_symbol TEXT NOT NULL DEFAULT '$',
      hour_rounding REAL NOT NULL DEFAULT 0.1,
      display_mode TEXT NOT NULL DEFAULT 'money',
      theme_mode TEXT NOT NULL DEFAULT 'system',
      insights_prefs_json TEXT,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

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

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_from_account_id ON transactions(from_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id ON transactions(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_wage_month_unique ON monthly_wage_settings(month) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_monthly_wage_month ON monthly_wage_settings(month);

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

    CREATE INDEX IF NOT EXISTS idx_account_groups_active_sort_name
      ON account_groups(sort_order, name)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_transactions_active_recurrence_parent
      ON transactions(recurrence_parent_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_active_recurrence_pattern
      ON transactions(recurrence_pattern, date DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next_run
      ON recurring_rules(next_run_date)
      WHERE deleted_at IS NULL AND is_active = 1;
  `);
}

function migrateV2(db: SQLiteDatabase) {
  const categoryColumns = db.getAllSync<{ name: string }>(`PRAGMA table_info(categories)`);
  const hasColorColumn = categoryColumns.some((column) => column.name === 'color');
  if (!hasColorColumn) return;

  db.execSync(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
    DROP TABLE IF EXISTS categories_v2;

    CREATE TABLE categories_v2 (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    INSERT INTO categories_v2 (
      id,
      name,
      sort_order,
      type,
      parent_id,
      icon,
      is_default,
      created_at,
      updated_at,
      deleted_at
    )
    SELECT
      id,
      name,
      sort_order,
      type,
      parent_id,
      icon,
      is_default,
      created_at,
      updated_at,
      deleted_at
    FROM categories;

    DROP TABLE categories;
    ALTER TABLE categories_v2 RENAME TO categories;

    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_active_type_sort_name
      ON categories(type, sort_order, name)
      WHERE deleted_at IS NULL;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateV3(db: SQLiteDatabase) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(settings)`);
  if (cols.some((c) => c.name === 'user_mode')) return;
  db.execSync(`ALTER TABLE settings ADD COLUMN user_mode TEXT NOT NULL DEFAULT 'power'`);
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
  ensureDefaultCategories();
}

function ensureDefaultCategories() {
  const db = getDb();
  const now = nowIso();

  const existingCategories = db
    .select({ count: sql<number>`count(*)` })
    .from(categoriesTable)
    .where(isNull(categoriesTable.deletedAt))
    .get();

  if ((existingCategories?.count ?? 0) > 0) return;

  const allCategories = [
    ...ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
    ...ONBOARDING_MINIMAL_INCOME_CATEGORIES,
  ];

  allCategories.forEach((category, index) => {
    db.insert(categoriesTable)
      .values({
        id: newId(),
        name: category.name,
        sortOrder: index,
        type: category.type,
        parentId: category.parentId,
        icon: category.icon,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  });
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
  ensureCoreData();
}
