import type { SQLiteDatabase } from 'expo-sqlite';

import migration065 from '~/lib/db/migrations/065_goal_cover_photo';

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

describe('goal cover photo migration', () => {
  it('adds a nullable TEXT goal_cover_uri column to accounts', () => {
    const { db, executed, columns } = makeDb(['id', 'name', 'goal_emoji']);
    migration065.up(db);
    expect(columns).toContain('goal_cover_uri');
    expect(executed).toEqual(['ALTER TABLE accounts ADD COLUMN goal_cover_uri TEXT;']);
  });

  it('is a no-op when replayed on a database that already has it', () => {
    const { db, executed } = makeDb(['id', 'goal_cover_uri']);
    migration065.up(db);
    expect(executed).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration065.version).toBe(65);
    expect(migration065.name).toBe('065_goal_cover_photo');
  });
});
