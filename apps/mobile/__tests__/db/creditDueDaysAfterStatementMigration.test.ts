import type { SQLiteDatabase } from 'expo-sqlite';

import migration084 from '~/lib/db/migrations/084_credit_due_days_after_statement';

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

describe('credit due days after statement migration', () => {
  it('adds a nullable INTEGER column, so every existing card keeps its fixed due day', () => {
    const { db, executed, columns } = makeDb(['id', 'credit_statement_day', 'credit_due_day']);
    migration084.up(db);
    expect(columns).toContain('credit_due_days_after_statement');
    expect(executed).toEqual([
      'ALTER TABLE accounts ADD COLUMN credit_due_days_after_statement INTEGER;',
    ]);
  });

  it('is a no-op when replayed on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'credit_due_days_after_statement']);
    migration084.up(db);
    expect(executed).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration084.version).toBe(84);
    expect(migration084.name).toBe('084_credit_due_days_after_statement');
  });
});
