import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import {
  ONBOARDING_MINIMAL_EXPENSE_CATEGORIES,
  ONBOARDING_MINIMAL_INCOME_CATEGORIES,
} from '~/constants/appDefaults';
import { getDeviceLocale } from '~/lib/i18n';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';

import { runMigrations } from './migrations';
import { categoriesTable, settingsTable } from './schema';

const DB_NAME = 'money2time.db';
export const SIMPLE_WALLET_NAME = 'Simple Wallet';

let sqlite: SQLiteDatabase | null = null;
let initialized = false;

function ensureCoreData() {
  const db = getDb();
  const now = nowIso();

  const settingsRow = db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.id, 'primary'), isNull(settingsTable.deletedAt)))
    .get();

  if (!settingsRow) {
    const localeCurrencyCode = getLocaleCurrencyCode();
    const localeCurrencySymbol = getLocaleCurrencySymbol();
    db.insert(settingsTable)
      .values({
        id: 'primary',
        locale: getDeviceLocale(),
        currencyCode: localeCurrencyCode,
        currencySymbol: localeCurrencySymbol,
        hourRounding: 0.1,
        displayMode: 'money',
        themeMode: 'system',
        themeColor: 'sage',
        insightsPrefsJson: null,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }

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
