import type { SQLiteDatabase } from 'expo-sqlite';

import migration056RecurringLogoId from '~/lib/db/migrations/056_recurring_logo_id';
import migration057SettingsSubscriptionLogoCountry from '~/lib/db/migrations/057_settings_subscription_logo_country';

function makeDb(columnsByTable: Record<string, string[]>) {
  const tables: Record<string, string[]> = Object.fromEntries(
    Object.entries(columnsByTable).map(([table, columns]) => [table, [...columns]]),
  );
  const executed: string[] = [];
  const db = {
    getAllSync: (sql: string) => {
      const table = /PRAGMA table_info\((\w+)\)/.exec(sql)?.[1] ?? '';
      return (tables[table] ?? []).map((name) => ({ name }));
    },
    execSync: (sql: string) => {
      executed.push(sql.trim());
      const match = /ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
      if (match) tables[match[1]].push(match[2]);
    },
  } as unknown as SQLiteDatabase;
  return { db, executed };
}

describe('recurring rule logo migration', () => {
  it('adds a nullable logo column, leaving existing rules without one', () => {
    const { db, executed } = makeDb({ recurring_rules: ['id', 'name'] });

    migration056RecurringLogoId.up(db);

    expect(executed).toEqual(['ALTER TABLE recurring_rules ADD COLUMN logo_id TEXT;']);
  });

  it('is safe to replay', () => {
    const { db, executed } = makeDb({ recurring_rules: ['id', 'logo_id'] });

    migration056RecurringLogoId.up(db);

    expect(executed).toEqual([]);
  });
});

describe('subscription logo country migration', () => {
  it('adds the picker country column', () => {
    const { db, executed } = makeDb({ settings: ['id', 'account_logo_country'] });

    migration057SettingsSubscriptionLogoCountry.up(db);

    expect(executed).toEqual(['ALTER TABLE settings ADD COLUMN subscription_logo_country TEXT;']);
  });

  it('is safe to replay', () => {
    const { db, executed } = makeDb({ settings: ['id', 'subscription_logo_country'] });

    migration057SettingsSubscriptionLogoCountry.up(db);

    expect(executed).toEqual([]);
  });

  it('stays a separate version from the recurring-rule column', () => {
    // The two columns landed in one migration originally, which stranded any
    // install that had already applied 056: a migration never re-runs, so the
    // appended column would never arrive. Keep them apart.
    expect(migration056RecurringLogoId.version).toBe(56);
    expect(migration057SettingsSubscriptionLogoCountry.version).toBe(57);
  });
});
