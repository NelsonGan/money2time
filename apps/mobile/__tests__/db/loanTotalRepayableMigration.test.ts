import type { SQLiteDatabase } from 'expo-sqlite';

import migration059LoanTotalRepayable from '~/lib/db/migrations/059_loan_total_repayable';

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

describe('loan total-repayable migration', () => {
  it('adds the column to accounts', () => {
    const { db, executed, columns } = makeDb(['id', 'name', 'type']);
    migration059LoanTotalRepayable.up(db);
    expect(columns).toContain('loan_total_repayable');
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain('loan_total_repayable');
  });

  it('is a no-op on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'name', 'type', 'loan_total_repayable']);
    migration059LoanTotalRepayable.up(db);
    // Idempotent: installs half-applied under the old runner replay this.
    expect(executed).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration059LoanTotalRepayable.version).toBe(59);
    expect(migration059LoanTotalRepayable.name).toBe('059_loan_total_repayable');
  });
});
