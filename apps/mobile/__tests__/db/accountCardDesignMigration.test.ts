import type { SQLiteDatabase } from 'expo-sqlite';

import migration070 from '~/lib/db/migrations/070_account_card_design';

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

describe('account card design migration', () => {
  it('adds a nullable TEXT card_design column to accounts', () => {
    const { db, executed, columns } = makeDb(['id', 'name', 'logo_id']);
    migration070.up(db);
    expect(columns).toContain('card_design');
    expect(executed).toEqual(['ALTER TABLE accounts ADD COLUMN card_design TEXT;']);
  });

  it('is a no-op when replayed on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'card_design']);
    migration070.up(db);
    expect(executed).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration070.version).toBe(70);
    expect(migration070.name).toBe('070_account_card_design');
  });
});
