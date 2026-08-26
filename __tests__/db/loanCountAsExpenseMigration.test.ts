import type { SQLiteDatabase } from 'expo-sqlite';

import migration058LoanCountAsExpense from '~/lib/db/migrations/058_loan_count_as_expense';

/**
 * `PRAGMA table_info` is per table here, so the fake tracks a column set for
 * each of the three tables this migration touches.
 */
function makeDb(initialColumns: Record<string, string[]>) {
  const columns: Record<string, string[]> = Object.fromEntries(
    Object.entries(initialColumns).map(([table, names]) => [table, [...names]]),
  );
  const executed: string[] = [];
  const db = {
    getAllSync: (sql: string) => {
      const table = /PRAGMA table_info\((\w+)\)/.exec(sql)?.[1] ?? '';
      return (columns[table] ?? []).map((name) => ({ name }));
    },
    execSync: (sql: string) => {
      executed.push(sql.trim());
      const match = /ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
      if (match?.[1] && match[2]) (columns[match[1]] ??= []).push(match[2]);
    },
  } as unknown as SQLiteDatabase;
  return { db, executed };
}

const EMPTY = {
  accounts: ['id', 'name', 'type'],
  recurring_rules: ['id', 'name', 'type'],
  transactions: ['id', 'type', 'amount'],
};

describe('loan count-as-expense migration', () => {
  it('adds the loan reporting columns and the two stamps', () => {
    const { db, executed } = makeDb(EMPTY);

    migration058LoanCountAsExpense.up(db);

    expect(executed).toEqual([
      'ALTER TABLE accounts ADD COLUMN loan_count_as_expense INTEGER;',
      'ALTER TABLE accounts ADD COLUMN loan_payment_category_id TEXT;',
      'ALTER TABLE recurring_rules ADD COLUMN counts_as_expense INTEGER NOT NULL DEFAULT 0;',
      'ALTER TABLE transactions ADD COLUMN counts_as_expense INTEGER NOT NULL DEFAULT 0;',
    ]);
  });

  it('leaves every existing transfer uncounted, so no upgrade moves a total', () => {
    const { db, executed } = makeDb(EMPTY);

    migration058LoanCountAsExpense.up(db);

    const transactionsDdl = executed.find((sql) => sql.includes('TABLE transactions'));
    expect(transactionsDdl).toContain('DEFAULT 0');
  });

  it('is safe to replay', () => {
    const { db, executed } = makeDb({
      accounts: [...EMPTY.accounts, 'loan_count_as_expense', 'loan_payment_category_id'],
      recurring_rules: [...EMPTY.recurring_rules, 'counts_as_expense'],
      transactions: [...EMPTY.transactions, 'counts_as_expense'],
    });

    migration058LoanCountAsExpense.up(db);

    expect(executed).toEqual([]);
  });

  it('resumes a half-applied replay without touching what landed', () => {
    const { db, executed } = makeDb({
      ...EMPTY,
      accounts: [...EMPTY.accounts, 'loan_count_as_expense'],
    });

    migration058LoanCountAsExpense.up(db);

    expect(executed).toEqual([
      'ALTER TABLE accounts ADD COLUMN loan_payment_category_id TEXT;',
      'ALTER TABLE recurring_rules ADD COLUMN counts_as_expense INTEGER NOT NULL DEFAULT 0;',
      'ALTER TABLE transactions ADD COLUMN counts_as_expense INTEGER NOT NULL DEFAULT 0;',
    ]);
  });
});
