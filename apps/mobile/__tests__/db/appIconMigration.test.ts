import type { SQLiteDatabase } from 'expo-sqlite';

import migration055SettingsAppIcon from '~/lib/db/migrations/055_settings_app_icon';

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

describe('app icon migration', () => {
  it('defaults every existing install to the icon it already has', () => {
    const { db, executed } = makeDb(['id', 'theme_mode']);

    migration055SettingsAppIcon.up(db);

    expect(executed).toEqual([
      "ALTER TABLE settings ADD COLUMN app_icon TEXT NOT NULL DEFAULT 'classic';",
    ]);
  });

  it('is safe to replay', () => {
    const { db, executed } = makeDb(['id', 'app_icon']);

    migration055SettingsAppIcon.up(db);

    expect(executed).toEqual([]);
  });
});
