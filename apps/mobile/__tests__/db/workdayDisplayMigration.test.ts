import type { SQLiteDatabase } from 'expo-sqlite';

import migration054SettingsWorkdayDisplay from '~/lib/db/migrations/054_settings_workday_display';

function makeDb(initialColumns: string[]) {
  const columns = [...initialColumns];
  const executed: string[] = [];
  const db = {
    getAllSync: () => columns.map((name) => ({ name })),
    execSync: (sql: string) => {
      executed.push(sql.trim());
      const column = /ADD COLUMN (\w+)/.exec(sql)?.[1];
      if (column) columns.push(column);
    },
  } as unknown as SQLiteDatabase;
  return { db, executed };
}

describe('working-day display migration', () => {
  it('adds opt-in settings with disabled and eight-hour defaults', () => {
    const { db, executed } = makeDb(['id', 'display_mode']);

    migration054SettingsWorkdayDisplay.up(db);

    expect(executed).toEqual([
      'ALTER TABLE settings ADD COLUMN workday_display_enabled INTEGER NOT NULL DEFAULT 0;',
      'ALTER TABLE settings ADD COLUMN working_hours_per_day REAL NOT NULL DEFAULT 8;',
    ]);
  });

  it('is safe to replay', () => {
    const { db, executed } = makeDb(['id', 'workday_display_enabled', 'working_hours_per_day']);

    migration054SettingsWorkdayDisplay.up(db);

    expect(executed).toEqual([]);
  });
});
