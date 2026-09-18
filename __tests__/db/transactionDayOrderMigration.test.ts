import type { SQLiteDatabase } from 'expo-sqlite';

import migration064 from '~/lib/db/migrations/064_transaction_day_order';

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

describe('transaction day order migration', () => {
  it('adds a nullable REAL day_order column to transactions', () => {
    const { db, executed, columns } = makeDb(['id', 'date', 'updated_at']);
    migration064.up(db);
    expect(columns).toContain('day_order');
    expect(executed).toEqual(['ALTER TABLE transactions ADD COLUMN day_order REAL;']);
  });

  it('is a no-op when replayed on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'day_order']);
    migration064.up(db);
    expect(executed).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration064.version).toBe(64);
    expect(migration064.name).toBe('064_transaction_day_order');
  });
});
