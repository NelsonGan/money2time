import type { SQLiteDatabase } from 'expo-sqlite';

import migration064SettingsAnalyticsConsent from '~/lib/db/migrations/064_settings_analytics_consent';

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

describe('analytics consent migration', () => {
  it('keeps analytics disabled for existing installs until the user opts in', () => {
    const { db, executed } = makeDb(['id', 'onboarding_completed']);

    migration064SettingsAnalyticsConsent.up(db);

    expect(executed).toEqual([
      'ALTER TABLE settings ADD COLUMN analytics_enabled INTEGER NOT NULL DEFAULT 0;',
    ]);
  });

  it('is safe to replay', () => {
    const { db, executed } = makeDb(['id', 'analytics_enabled']);

    migration064SettingsAnalyticsConsent.up(db);

    expect(executed).toEqual([]);
  });
});
