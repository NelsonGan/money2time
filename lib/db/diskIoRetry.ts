import { busyWaitSync } from './busyWaitSync';

/**
 * Shared retry budget for the handful of synchronous `expo-sqlite` calls that
 * can throw a bare `disk I/O error` (SQLITE_IOERR) for conditions unrelated to
 * real disk failure — most commonly another process (an iCloud/Google Drive
 * backup restore, a Spotlight-style file indexer) briefly holding the DB file
 * lock. Three independent call sites (`applyPragmas`, `readUserVersion`,
 * `SettingsRepository#get`) used to retry this with their own copy of the same
 * loop, each giving up after a ~60ms total pause (3 attempts, 15ms/45ms gaps).
 * That budget kept being too short: MONEY2TIME-2G, -2H and -2S all recurred on
 * the very builds that already shipped it, always as the same bare disk I/O
 * error, which means the lock-holding process needs more than 60ms to clear on
 * some devices. Centralizing the loop here so a wider budget is one change
 * instead of three, and raising it to 5 attempts with growing gaps (a ~1.1s
 * worst-case pause) — still far under anything a user would notice as a hang,
 * but a real order of magnitude more slack than before. A genuine failure
 * (corruption, real I/O failure) still throws once the attempts are spent.
 */
const MAX_DISK_IO_ATTEMPTS = 5;

/** Gap before each retry (index 0 = before attempt 2, ... index 3 = before attempt 5). */
const DISK_IO_RETRY_DELAYS_MS = [20, 60, 150, 350];

export function retryDiskIO<T>(operation: () => T, sleep: (ms: number) => void = busyWaitSync): T {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_DISK_IO_ATTEMPTS; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      const delay = DISK_IO_RETRY_DELAYS_MS[attempt - 1];
      if (delay !== undefined) sleep(delay);
    }
  }
  throw lastError;
}
