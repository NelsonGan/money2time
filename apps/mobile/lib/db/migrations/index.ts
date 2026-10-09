import type { SQLiteDatabase } from 'expo-sqlite';

import { applyMigrations, assertMigrationOrder, type MigrationRunResult } from './runner';
import type { DbMigration } from './types';

export type { MigrationRunResult } from './runner';

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

assertMigrationOrder(MIGRATIONS);

export function runMigrations(db: SQLiteDatabase): MigrationRunResult {
  return applyMigrations(db, MIGRATIONS);
}
