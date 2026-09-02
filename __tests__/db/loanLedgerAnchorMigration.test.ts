import type { SQLiteDatabase } from 'expo-sqlite';

import migration062 from '~/lib/db/migrations/062_loan_ledger_anchor_and_rate_changes';

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

describe('loan ledger anchor and rate changes migration', () => {
  it('adds both columns to accounts', () => {
    const { db, executed, columns } = makeDb(['id', 'name', 'type']);
    migration062.up(db);
    expect(columns).toContain('loan_ledger_anchor_date');
    expect(columns).toContain('loan_rate_changes_json');
    expect(executed).toHaveLength(2);
  });

  it('adds only the column that is missing', () => {
    const { db, executed } = makeDb(['id', 'loan_ledger_anchor_date']);
    migration062.up(db);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain('loan_rate_changes_json');
  });

  it('is a no-op on a database that already has them', () => {
    const { db, executed } = makeDb(['id', 'loan_ledger_anchor_date', 'loan_rate_changes_json']);
    migration062.up(db);
    expect(executed).toHaveLength(0);
  });

  it('leaves existing loans null rather than backfilling them', () => {
    const { db, executed } = makeDb(['id']);
    migration062.up(db);
    // Null anchors on the creation day, which is exactly where every loan
    // before this walked from.
    expect(executed.some((statement) => /UPDATE/i.test(statement))).toBe(false);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration062.version).toBe(62);
    expect(migration062.name).toBe('062_loan_ledger_anchor_and_rate_changes');
  });
});
