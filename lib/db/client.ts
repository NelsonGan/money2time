import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { getDeviceLocale } from '~/lib/i18n';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { newAppUserId, nowIso } from '~/utils/id';

import { backfillFirstAppOpen } from './backfillFirstAppOpen';
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
        weekStartsOn: 1,
        autoBackupEnabled: true,
        autoBackupTarget: 'local',
        lastAutoBackupAt: null,
        lastAutoBackupError: null,
        firstAppOpen: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }
}

function applyPragmas(db: SQLiteDatabase) {
  // WAL persists on the DB file once set; the rest are per-connection and must
  // be reapplied on every open. NORMAL synchronous is the recommended WAL pairing
  // (durable across app crashes, only loses data on full OS/power loss). mmap +
  // larger cache + in-memory temp store cut read latency on the activity/insights
  // hot paths that scan the transactions table.
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 134217728;
    PRAGMA cache_size = -8000;
  `);
}

export function getSQLite(): SQLiteDatabase {
  if (!sqlite) {
    sqlite = openDatabaseSync(DB_NAME);
    applyPragmas(sqlite);
  }
  return sqlite;
}

export function getDb() {
  return drizzle(getSQLite());
}

export function initializeDatabase() {
  const sqliteDb = getSQLite();
  runMigrations(sqliteDb);
  if (!initialized) {
    ensureCoreData();
    backfillFirstAppOpen(sqliteDb);
    initialized = true;
    return;
  }
  ensureCoreData();
  backfillFirstAppOpen(sqliteDb);
}
