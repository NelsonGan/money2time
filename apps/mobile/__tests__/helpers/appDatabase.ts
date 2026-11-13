import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { applyMigrations } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';

// The app's database for a test: real SQLite (node:sqlite) behind the two
// things the app reads it through, expo-sqlite's synchronous calls
// (`getSQLite`) and Drizzle (`getDb`), with every migration applied. So a
// test can run the real repositories and services on real rows.
//
//   jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn(), getDb: jest.fn() }));
//   const app = openAppDatabase();
//   (getSQLite as jest.Mock).mockReturnValue(app.db);
//   (getDb as jest.Mock).mockReturnValue(app.orm);

const MIGRATIONS_DIR = join(__dirname, '../../lib/db/migrations');

type Param = string | number | null;

function loadMigrations(): DbMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.+\.ts$/.test(file))
    .sort()
    .map((file) => (require(join(MIGRATIONS_DIR, file)) as { default: DbMigration }).default);
}

export function openAppDatabase() {
  const connection = new DatabaseSync(':memory:');
  const flat = (params: unknown[]) => params.flat() as Param[];
  const db = {
    execSync: (sql: string) => connection.exec(sql),
    getAllSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).all(...flat(params)),
    getFirstSync: (sql: string, ...params: unknown[]) =>
      connection.prepare(sql).get(...flat(params)) ?? null,
    runSync: (sql: string, ...params: unknown[]) => connection.prepare(sql).run(...flat(params)),
    withTransactionSync: (task: () => void) => {
      connection.exec('BEGIN');
      try {
        task();
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    // What Drizzle's expo-sqlite driver asks of a statement.
    prepareSync: (sql: string) => {
      const statement = connection.prepare(sql);
      const reads = /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
      const result = (rows: unknown[], changes = 0, lastInsertRowId = 0) => ({
        changes,
        lastInsertRowId,
        getAllSync: () => rows,
        getFirstSync: () => rows[0] ?? null,
      });
      return {
        executeSync: (params: unknown[] = []) => {
          if (reads) return result(statement.all(...flat([params])));
          const done = statement.run(...flat([params]));
          return result([], Number(done.changes), Number(done.lastInsertRowid));
        },
        executeForRawResultSync: (params: unknown[] = []) => {
          statement.setReturnArrays(true);
          try {
            return result(statement.all(...flat([params])));
          } finally {
            statement.setReturnArrays(false);
          }
        },
        finalizeSync: () => undefined,
      };
    },
  } as unknown as SQLiteDatabase;
  applyMigrations(db, loadMigrations());
  const orm = drizzle(db);
  const all = (sql: string, ...params: Param[]) =>
    connection.prepare(sql).all(...params) as Record<string, unknown>[];
  return { db, orm, connection, all, close: () => connection.close() };
}
