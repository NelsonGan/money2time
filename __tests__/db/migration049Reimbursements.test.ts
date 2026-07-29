import type { SQLiteDatabase } from 'expo-sqlite';

import migration049 from '~/lib/db/migrations/049_transaction_reimbursements';

const CLAIM_COLUMNS = [
  'reimbursement_status',
  'reimbursement_payer',
  'reimbursement_amount',
  'reimbursement_claimed_at',
  'reimbursed_at',
  'reimbursement_account_id',
  'reimbursement_transaction_id',
];

/** Fake exposing just `PRAGMA table_info` and recording the DDL that runs. */
function makeDb(schema: Record<string, string[]>) {
  const executed: string[] = [];

  const db = {
    getAllSync: (sql: string) => {
      const table = /PRAGMA table_info\((\w+)\)/.exec(sql)?.[1] ?? '';
      return (schema[table] ?? []).map((name) => ({ name }));
    },
    execSync: (sql: string) => {
      executed.push(sql.trim());
      const match = /ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
      if (match) schema[match[1]!] = [...(schema[match[1]!] ?? []), match[2]!];
    },
  } as unknown as SQLiteDatabase;

  return { db, executed, schema };
}

function addedColumns(executed: string[]): string[] {
  return executed
    .map((sql) => /ADD COLUMN (\w+)/.exec(sql)?.[1])
    .filter((name): name is string => Boolean(name));
}

describe('migration 049: transaction reimbursements', () => {
  it('is registered at the version its filename claims', () => {
    expect(migration049.version).toBe(49);
    expect(migration049.name).toBe('049_transaction_reimbursements');
  });

  it('adds every claim column to a pre-049 transactions table', () => {
    const { db, executed } = makeDb({ transactions: ['id', 'amount', 'deleted_at'] });

    migration049.up(db);

    expect(addedColumns(executed)).toEqual(CLAIM_COLUMNS);
  });

  it('creates the pending-list index guarded by IF NOT EXISTS', () => {
    const { db, executed } = makeDb({ transactions: ['id'] });

    migration049.up(db);

    const index = executed.find((sql) => sql.includes('CREATE INDEX'));
    expect(index).toContain('IF NOT EXISTS idx_transactions_reimbursement_status');
    expect(index).toContain('reimbursement_status IS NOT NULL');
  });

  it('is idempotent: a replay on an applied DB adds nothing', () => {
    // Installs that upgraded under the old all-or-nothing runner can sit
    // half-applied and replay this migration on the next launch. A bare ALTER
    // would throw "duplicate column name" there and brick the app.
    const { db, executed } = makeDb({ transactions: ['id', ...CLAIM_COLUMNS] });

    migration049.up(db);

    expect(addedColumns(executed)).toEqual([]);
  });

  it('is idempotent column by column: a half-applied replay adds only the rest', () => {
    const { db, executed } = makeDb({
      transactions: ['id', 'reimbursement_status', 'reimbursement_payer'],
    });

    migration049.up(db);

    expect(addedColumns(executed)).toEqual(CLAIM_COLUMNS.slice(2));
  });

  it('running twice in a row leaves the same schema as running once', () => {
    const once = makeDb({ transactions: ['id'] });
    migration049.up(once.db);

    const twice = makeDb({ transactions: ['id'] });
    migration049.up(twice.db);
    migration049.up(twice.db);

    expect(twice.schema.transactions).toEqual(once.schema.transactions);
  });
});
