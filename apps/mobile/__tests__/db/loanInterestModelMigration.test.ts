import type { SQLiteDatabase } from 'expo-sqlite';

import migration061LoanInterestModel from '~/lib/db/migrations/061_loan_interest_model';

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

describe('loan interest-model migration', () => {
  it('adds the column to accounts', () => {
    const { db, executed, columns } = makeDb(['id', 'name', 'type']);
    migration061LoanInterestModel.up(db);
    expect(columns).toContain('loan_interest_model');
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain('loan_interest_model');
  });

  it('is a no-op on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'name', 'type', 'loan_interest_model']);
    migration061LoanInterestModel.up(db);
    // Idempotent: installs half-applied under the old runner replay this.
    expect(executed).toHaveLength(0);
  });

  it('leaves existing loans null rather than backfilling them', () => {
    const { db, executed } = makeDb(['id', 'name', 'type']);
    migration061LoanInterestModel.up(db);
    // Null reads as flat through loanInterestModelOf, which is exactly how
    // every loan behaved before the models were split.
    expect(executed.some((statement) => /UPDATE/i.test(statement))).toBe(false);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration061LoanInterestModel.version).toBe(61);
    expect(migration061LoanInterestModel.name).toBe('061_loan_interest_model');
  });
});
