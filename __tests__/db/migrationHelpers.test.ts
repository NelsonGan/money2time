import type { SQLiteDatabase } from 'expo-sqlite';

import { addColumnIfMissing, addColumnsIfMissing, hasColumn } from '~/lib/db/migrations/helpers';

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
      if (match) schema[match[1]] = [...(schema[match[1]] ?? []), match[2]];
    },
  } as unknown as SQLiteDatabase;

  return { db, executed, schema };
}

describe('hasColumn', () => {
  it('reports presence from PRAGMA table_info', () => {
    const { db } = makeDb({ settings: ['id', 'locale'] });
    expect(hasColumn(db, 'settings', 'locale')).toBe(true);
    expect(hasColumn(db, 'settings', 'payment_qr_uri')).toBe(false);
  });
});

describe('addColumnIfMissing', () => {
  it('adds a column that does not exist yet', () => {
    const { db, executed } = makeDb({ settings: ['id'] });

    addColumnIfMissing(db, 'settings', 'payment_qr_uri', 'TEXT');

    expect(executed).toEqual(['ALTER TABLE settings ADD COLUMN payment_qr_uri TEXT;']);
  });

  it('is a no-op when the column is already there', () => {
    const { db, executed } = makeDb({ settings: ['id', 'payment_qr_uri'] });

    addColumnIfMissing(db, 'settings', 'payment_qr_uri', 'TEXT');

    expect(executed).toEqual([]);
  });

  it('is safe to replay, which is what unbricks a half-migrated install', () => {
    // An install whose user_version trailed the DDL under the old all-or-nothing
    // runner replays these migrations on the next launch. A bare ALTER TABLE
    // threw "duplicate column name" there, permanently.
    const { db, executed } = makeDb({ accounts: ['id'] });

    addColumnIfMissing(db, 'accounts', 'goal_target_amount', 'REAL');
    expect(() => addColumnIfMissing(db, 'accounts', 'goal_target_amount', 'REAL')).not.toThrow();

    expect(executed).toHaveLength(1);
  });
});

describe('addColumnsIfMissing', () => {
  it('adds only the missing columns of a batch', () => {
    const { db, executed } = makeDb({ budget_templates: ['id', 'emoji'] });

    addColumnsIfMissing(db, 'budget_templates', [
      ['emoji', 'TEXT'],
      ['count_unbudgeted', 'INTEGER NOT NULL DEFAULT 1'],
    ]);

    expect(executed).toEqual([
      'ALTER TABLE budget_templates ADD COLUMN count_unbudgeted INTEGER NOT NULL DEFAULT 1;',
    ]);
  });

  it('is a no-op on a fully applied batch', () => {
    const { db, executed } = makeDb({
      accounts: ['id', 'goal_target_amount', 'goal_target_date', 'goal_emoji'],
    });

    addColumnsIfMissing(db, 'accounts', [
      ['goal_target_amount', 'REAL'],
      ['goal_target_date', 'TEXT'],
      ['goal_emoji', 'TEXT'],
    ]);

    expect(executed).toEqual([]);
  });
});
