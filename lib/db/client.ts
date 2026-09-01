import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { Logger } from 'drizzle-orm/logger';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_APP_ICON_ID } from '~/constants/appIcons';
import { getDeviceLocale } from '~/lib/i18n';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { newAppUserId, nowIso } from '~/utils/id';

import { backfillFirstAppOpen } from './backfillFirstAppOpen';
import { busyWaitSync } from './busyWaitSync';
import { retryDiskIO } from './diskIoRetry';
import { type MigrationRunResult, runMigrations } from './migrations';
import { settingsTable } from './schema';

const DB_NAME = 'money2time.db';
export const SIMPLE_WALLET_NAME = 'Simple Wallet';

let sqlite: SQLiteDatabase | null = null;

// Dev-only SQL logger. Prints every Drizzle query to the Metro console with a
// since-boot timestamp and a running count, so query storms (e.g. an N+1) are
// obvious while developing. Compiled out of release builds via __DEV__. Params
// are intentionally omitted to keep the log readable and avoid logging any
// financial data.
let devSqlCount = 0;
const DEV_SQL_START = Date.now();
const devSqlLogger: Logger | undefined = __DEV__
  ? {
      logQuery(query: string): void {
        devSqlCount += 1;
        console.warn(`[sql #${devSqlCount} +${Date.now() - DEV_SQL_START}ms] ${query}`);
      },
    }
  : undefined;

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
        workdayDisplayEnabled: false,
        workingHoursPerDay: 8,
        hapticsEnabled: true,
        themeMode: 'system',
        themeColor: 'rosewood',
        iconStyle: 'clay',
        appIcon: DEFAULT_APP_ICON_ID,
        insightsPrefsJson: null,
        notificationPrefsJson: null,
        quickEntryPrefsJson: null,
        calendarPrefsJson: null,
        onboardingCompleted: false,
        weekStartsOn: 1,
        firstDayOfMonth: 1,
        firstDayOverridesJson: null,
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

function applyPragmas(db: SQLiteDatabase, sleep: (ms: number) => void = busyWaitSync) {
  // WAL persists on the DB file once set; the rest are per-connection and must
  // be reapplied on every open. NORMAL synchronous is the recommended WAL pairing
  // (durable across app crashes, only loses data on full OS/power loss). mmap +
  // larger cache + in-memory temp store cut read latency on the activity/insights
  // hot paths that scan the transactions table.
  const sql = `
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 134217728;
    PRAGMA cache_size = -8000;
  `;

  // Retries a transient `disk I/O error` right after the connection opens (see
  // `retryDiskIO`, Sentry MONEY2TIME-2G). The statements are idempotent
  // pragmas, so re-running them on retry is safe.
  retryDiskIO(() => db.execSync(sql), sleep);
}

export function getSQLite(): SQLiteDatabase {
  if (!sqlite) {
    sqlite = openDatabaseSync(DB_NAME);
    applyPragmas(sqlite);
  }
  return sqlite;
}

export function getDb() {
  return drizzle(getSQLite(), devSqlLogger ? { logger: devSqlLogger } : undefined);
}

export function initializeDatabase(): MigrationRunResult {
  const sqliteDb = getSQLite();
  const result = runMigrations(sqliteDb);
  ensureCoreData();
  backfillFirstAppOpen(sqliteDb);
  return result;
}
