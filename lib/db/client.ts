import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { Logger } from 'drizzle-orm/logger';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { getDeviceLocale } from '~/lib/i18n';
import { getLocaleCurrencyCode, getLocaleCurrencySymbol } from '~/utils/formatters';
import { newAppUserId, nowIso } from '~/utils/id';

import { backfillFirstAppOpen } from './backfillFirstAppOpen';
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
        hapticsEnabled: true,
        themeMode: 'system',
        themeColor: 'rosewood',
        iconStyle: 'clay',
        insightsPrefsJson: null,
        notificationPrefsJson: null,
        quickEntryPrefsJson: null,
        calendarPrefsJson: null,
        onboardingCompleted: false,
        weekStartsOn: 1,
        firstDayOfMonth: 1,
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

/** Retries for the pragma setup below; see the comment inside `applyPragmas`. */
const MAX_PRAGMA_ATTEMPTS = 3;

function applyPragmas(db: SQLiteDatabase) {
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

  // SQLite reports a bare `disk I/O error` (SQLITE_IOERR) for several transient
  // conditions unrelated to real disk failure, most commonly another process
  // (an iCloud/Google Drive backup restore, a Spotlight-style file indexer)
  // briefly holding the DB file lock right after the connection opens. That was
  // fatal to `initializeDatabase` immediately after the identical, already-retried
  // `PRAGMA user_version` read in the migration runner succeeded (Sentry
  // MONEY2TIME-2G: both errors seen back-to-back in the same launch/retry
  // session). A few immediate retries are cheap insurance against that window;
  // a genuine failure (corruption, real I/O failure) still throws after they're
  // spent. The statements are idempotent pragmas, so re-running them is safe.
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_PRAGMA_ATTEMPTS; attempt++) {
    try {
      db.execSync(sql);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
