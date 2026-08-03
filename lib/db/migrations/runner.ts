import type { SQLiteDatabase } from 'expo-sqlite';

import type { DbMigration } from './types';

export interface MigrationRunResult {
  isFreshDatabase: boolean;
  /** Migration versions applied by this run, in order. */
  appliedVersions: number[];
  /**
   * True when the DB was written by a newer build than this one (see the
   * downgrade note in `applyMigrations`). Surfaced so the caller can report it.
   */
  isDowngrade: boolean;
}

export function assertMigrationOrder(migrations: readonly DbMigration[]) {
  let previousVersion = 0;

  migrations.forEach((migration) => {
    if (migration.version <= previousVersion) {
      throw new Error(
        `Migrations must be strictly ascending. Check ${migration.name} (${migration.version}).`,
      );
    }

    previousVersion = migration.version;
  });
}

/** Retries for the initial `PRAGMA user_version` read; see `readUserVersion`. */
const MAX_VERSION_READ_ATTEMPTS = 3;

/**
 * Reads `PRAGMA user_version`, retrying a few times on failure.
 *
 * SQLite reports a bare `disk I/O error` (SQLITE_IOERR) for several
 * transient conditions unrelated to real disk failure, most commonly another
 * process (an iCloud/Google Drive backup restore, a Spotlight-style file
 * indexer) briefly holding the DB file lock. On app launch that error was
 * fatal to `refreshAll`, sending users straight to the DB-load retry card
 * even though the lock could clear a moment later (Sentry MONEY2TIME-1X).
 * A few immediate retries are cheap insurance against that window; a genuine
 * failure (corruption, real I/O failure) still throws after they're spent.
 */
function readUserVersion(db: SQLiteDatabase): number {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_VERSION_READ_ATTEMPTS; attempt++) {
    try {
      const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
      return row?.user_version ?? 0;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Apply every migration newer than the DB's recorded `user_version`.
 *
 * `migrations` must be sorted ascending (see `assertMigrationOrder`).
 */
export function applyMigrations(
  db: SQLiteDatabase,
  migrations: readonly DbMigration[],
): MigrationRunResult {
  const currentVersion = readUserVersion(db);
  const latestVersion = migrations[migrations.length - 1]?.version ?? 0;

  // The DB was written by a build newer than this one — a store rollback, a
  // sideloaded older APK, or a downgrade install. Leave it completely alone.
  //
  // This branch used to DROP every table and re-migrate from baseline, which
  // silently destroyed all of the user's financial data on what is otherwise a
  // recoverable situation. Running forward-only is safe instead: every migration
  // adds nullable columns or columns with defaults, and reads name their columns
  // explicitly, so a newer schema is readable by older code. `user_version` is
  // deliberately left high so re-upgrading does not replay migrations.
  if (currentVersion > latestVersion) {
    return { isFreshDatabase: false, appliedVersions: [], isDowngrade: true };
  }

  const appliedVersions: number[] = [];

  // Each migration commits on its own, with the `user_version` bump inside the
  // same transaction. Previously the whole batch ran unwrapped and the version
  // was bumped once at the end, so a throw — or an OS kill / OOM part-way
  // through a long batch — left the schema half-migrated with the old version
  // recorded. The next launch then replayed already-applied migrations, and any
  // bare `ALTER TABLE ... ADD COLUMN` threw "duplicate column name" on every
  // launch forever, with no way out short of reinstalling. Committing per
  // migration makes progress durable: a failure costs the failed migration
  // only, and the next launch resumes from exactly where it stopped.
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    try {
      db.withTransactionSync(() => {
        migration.up(db);
        // Transactional in SQLite (it is a database-header write), so this is
        // rolled back with the migration's own statements on failure.
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      throw new Error(
        `Migration ${migration.name} (${migration.version}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    appliedVersions.push(migration.version);
  }

  return { isFreshDatabase: currentVersion === 0, appliedVersions, isDowngrade: false };
}
