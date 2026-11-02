import type { SQLiteDatabase } from 'expo-sqlite';

import migration077 from '~/lib/db/migrations/077_recurring_anchor_day';

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

describe('recurring anchor day migration', () => {
  it('adds anchor_day to recurring_rules', () => {
    const { db, executed, columns } = makeDb(['id', 'next_run_date']);
    migration077.up(db);
    expect(columns).toContain('anchor_day');
    expect(executed).toEqual(['ALTER TABLE recurring_rules ADD COLUMN anchor_day INTEGER;']);
  });

  it('is a no-op on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'anchor_day']);
    migration077.up(db);
    expect(executed).toHaveLength(0);
  });

  it('leaves existing rules for the repair rather than backfilling them', () => {
    const { db, executed } = makeDb(['id']);
    migration077.up(db);
    expect(executed.some((statement) => /UPDATE/i.test(statement))).toBe(false);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration077.version).toBe(77);
    expect(migration077.name).toBe('077_recurring_anchor_day');
  });
});
