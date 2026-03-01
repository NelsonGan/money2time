import type { SQLiteDatabase } from 'expo-sqlite';

import type { DbMigration } from './types';

const MIGRATION_FILE_PATTERN = /^\.\/(\d{3})_[a-z0-9_-]+\.(ts|js)$/i;

interface RequireContext {
  keys(): string[];
  <T = unknown>(id: string): T;
}

interface RequireWithContext extends NodeRequire {
  context(
    path: string,
    recursive?: boolean,
    filter?: RegExp,
    mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once',
  ): RequireContext;
}

function versionFromFilePath(path: string) {
  const match = path.match(MIGRATION_FILE_PATTERN);
  if (!match?.[1]) {
    throw new Error(`Invalid migration file name: ${path}`);
  }
  return Number(match[1]);
}

function loadMigrations(): readonly DbMigration[] {
  const context = (require as RequireWithContext).context(
    '.',
    false,
    /^\.\/(\d{3})_[a-z0-9_-]+\.(ts|js)$/i,
  );

  return context
    .keys()
    .map((path: string) => {
      const module = context<{ default?: DbMigration }>(path);
      const migration = module.default;
      if (!migration) {
        throw new Error(`Migration "${path}" must export a default DbMigration`);
      }

      const expectedVersion = versionFromFilePath(path);
      if (migration.version !== expectedVersion) {
        throw new Error(
          `Migration "${path}" has version ${migration.version}, expected ${expectedVersion}.`,
        );
      }

      return migration;
    })
    .sort((a: DbMigration, b: DbMigration) => a.version - b.version);
}

const MIGRATIONS = loadMigrations();

function getLatestMigrationVersion() {
  return MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
}

function assertMigrationOrder(migrations: readonly DbMigration[]) {
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

assertMigrationOrder(MIGRATIONS);

function resetSchemaToBaseline(db: SQLiteDatabase) {
  db.execSync(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS recurring_rules;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS account_groups;
    DROP TABLE IF EXISTS monthly_wage_settings;
    DROP TABLE IF EXISTS settings;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

export function runMigrations(db: SQLiteDatabase) {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  const latestVersion = getLatestMigrationVersion();
  const shouldResetToBaseline = currentVersion > latestVersion;

  if (shouldResetToBaseline) {
    resetSchemaToBaseline(db);
  }

  const effectiveVersion = shouldResetToBaseline ? 0 : currentVersion;
  if (effectiveVersion >= latestVersion) {
    return { isFreshDatabase: currentVersion === 0 };
  }

  MIGRATIONS.forEach((migration) => {
    if (migration.version <= effectiveVersion) return;
    migration.up(db);
  });

  db.execSync(`PRAGMA user_version = ${latestVersion}`);
  return { isFreshDatabase: currentVersion === 0 || shouldResetToBaseline };
}
