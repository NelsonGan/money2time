import type { SQLiteDatabase } from 'expo-sqlite';

import migration080 from '~/lib/db/migrations/080_account_archived_at';

function makeDb(initialColumns: string[]) {
  const columns = [...initialColumns];
  const executed: string[] = [];
  const db = {
    getAllSync: () => columns.map((name) => ({ name })),
    execSync: (sql: string) => {
      executed.push(sql.trim());
      const match = /ALTER TABLE \w+ ADD COLUMN (\w+)/.exec(sql);
      if (match?.[1]) columns.push(match[1]);
    },
  } as unknown as SQLiteDatabase;
  return { db, executed, columns };
}

describe('account archive migration', () => {
  it('adds a nullable TEXT archived_at column to accounts', () => {
    const { db, executed, columns } = makeDb(['id', 'name', 'loan_archived_at']);
    migration080.up(db);
    expect(columns).toContain('archived_at');
    expect(executed).toEqual(['ALTER TABLE accounts ADD COLUMN archived_at TEXT;']);
  });

  it('is a no-op when replayed on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'archived_at']);
    migration080.up(db);
    expect(executed).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration080.version).toBe(80);
    expect(migration080.name).toBe('080_account_archived_at');
  });
});
