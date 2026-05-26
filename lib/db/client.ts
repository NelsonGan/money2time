import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { getDeviceLocale } from '~/lib/i18n';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { newAppUserId, nowIso } from '~/utils/id';

import { runMigrations } from './migrations';
import { settingsTable } from './schema';

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
        appUserId: newAppUserId(),
        locale: getDeviceLocale(),
        currencyCode: localeCurrencyCode,
        currencySymbol: localeCurrencySymbol,
        displayMode: 'money',
        hapticsEnabled: true,
        themeMode: 'system',
        themeColor: 'rosewood',
        insightsPrefsJson: null,
        notificationPrefsJson: null,
        quickEntryPrefsJson: null,
        calendarPrefsJson: null,
        onboardingCompleted: false,
        autoBackupEnabled: true,
        autoBackupTarget: 'local',
        lastAutoBackupAt: null,
        lastAutoBackupError: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }
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
