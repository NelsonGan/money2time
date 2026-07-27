import type { SQLiteDatabase } from 'expo-sqlite';

import { normalizeIconColumns, normalizeIconValue } from '~/lib/db/normalizeIcons';

interface Update {
  table: string;
  to: string;
  from: string;
}

/**
 * Same hand-rolled stand-in the currency normalizer test uses: a fake capturing
 * the UPDATEs rather than a real in-memory database.
 */
function makeDb(tableValues: Record<string, (string | null)[]>): {
  db: SQLiteDatabase;
  updates: Update[];
} {
  const updates: Update[] = [];
  const db = {
    getAllSync: (sql: string) => {
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
      if (!(table in tableValues)) {
        // Mirrors a table a given DB has not created yet.
        throw new Error(`no such table: ${table}`);
      }
      return tableValues[table].map((value) => ({ value }));
    },
    runSync: (sql: string, params: unknown[]) => {
      const table = /UPDATE (\w+)/.exec(sql)?.[1] ?? '';
      updates.push({ table, to: params[0] as string, from: params[1] as string });
    },
  } as unknown as SQLiteDatabase;
  return { db, updates };
}

describe('normalizeIconValue', () => {
  it('maps a legacy emoji to the icon it was already rendering as', () => {
    expect(normalizeIconValue('🍔')).toBe('meal');
    expect(normalizeIconValue('🏠')).toBe('house');
    expect(normalizeIconValue('🧾')).toBe('invoice');
  });

  it('collapses legacy emoji that shared an icon', () => {
    // 🍔 and 🍕 both rendered the meal artwork before the migration.
    expect(normalizeIconValue('🍕')).toBe('meal');
    expect(normalizeIconValue('📚')).toBe('graduation-cap');
    expect(normalizeIconValue('🎓')).toBe('graduation-cap');
  });

  it('tags an unmapped legacy glyph as a literal emoji', () => {
    // No hand-drawn artwork exists for these, so they were already rendering as
    // the glyph itself; tagging preserves that and makes it explicit.
    expect(normalizeIconValue('🎌')).toBe('emoji:🎌');
    expect(normalizeIconValue('🦄')).toBe('emoji:🦄');
  });

  it('leaves values already in the grammar untouched', () => {
    expect(normalizeIconValue('meal')).toBe('meal');
    expect(normalizeIconValue('emoji:🎌')).toBe('emoji:🎌');
    expect(normalizeIconValue('custom:category-icons/a.png')).toBe('custom:category-icons/a.png');
  });

  it('leaves a pack-qualified id untouched', () => {
    // Non-default packs store `pack/concept`, which contains a slash just like a
    // custom ref; the bundled-source lookup has to win before the fallbacks.
    expect(normalizeIconValue('clay/burger')).toBe('clay/burger');
  });

  it('preserves empty and absent values', () => {
    expect(normalizeIconValue('')).toBe('');
    expect(normalizeIconValue(null)).toBeNull();
    expect(normalizeIconValue(undefined)).toBeUndefined();
  });

  it('leaves an unrecognized ASCII token alone', () => {
    // Either an id from an icon pack this build does not ship, or junk. Either
    // way, rewriting it would destroy information the renderer already handles.
    expect(normalizeIconValue('some-unknown-id')).toBe('some-unknown-id');
  });

  it('is a fixpoint: normalizing its own output changes nothing', () => {
    // Load-bearing. runMigrations only bumps user_version once the whole batch
    // succeeds, so a throw mid-048 replays this over already-rewritten rows.
    for (const input of ['🍔', '🎌', 'meal', 'emoji:🎌', 'custom:category-icons/a.png', '', 'x']) {
      const once = normalizeIconValue(input) as string;
      expect(normalizeIconValue(once)).toBe(once);
    }
  });
});

describe('normalizeIconColumns', () => {
  const ALL_TABLES = {
    categories: [] as (string | null)[],
    accounts: [] as (string | null)[],
    budget_templates: [] as (string | null)[],
    monthly_budgets: [] as (string | null)[],
  };

  it('rewrites every icon-bearing column', () => {
    const { db, updates } = makeDb({
      categories: ['🍔'],
      accounts: ['🎯'],
      budget_templates: ['🛒'],
      monthly_budgets: ['🚗'],
    });
    normalizeIconColumns(db);
    expect(updates).toEqual([
      { table: 'categories', to: 'meal', from: '🍔' },
      // 🎯 has no legacy mapping, so it becomes a tagged emoji.
      { table: 'accounts', to: 'emoji:🎯', from: '🎯' },
      { table: 'budget_templates', to: 'grocery-basket', from: '🛒' },
      { table: 'monthly_budgets', to: 'car', from: '🚗' },
    ]);
  });

  it('migrates the frozen month copy too, so history matches its template', () => {
    const { db, updates } = makeDb({ ...ALL_TABLES, monthly_budgets: ['🏠'] });
    normalizeIconColumns(db);
    expect(updates).toEqual([{ table: 'monthly_budgets', to: 'house', from: '🏠' }]);
  });

  it('issues no UPDATE for values already in the grammar', () => {
    const { db, updates } = makeDb({
      ...ALL_TABLES,
      categories: ['meal', 'emoji:🎌', 'custom:category-icons/a.png', ''],
    });
    normalizeIconColumns(db);
    expect(updates).toEqual([]);
  });

  it('skips null values', () => {
    const { db, updates } = makeDb({ ...ALL_TABLES, accounts: [null] });
    normalizeIconColumns(db);
    expect(updates).toEqual([]);
  });

  it('survives a table that does not exist yet', () => {
    // The migration can run as part of an older DB's catch-up pass, before the
    // budget tables were created.
    const { db, updates } = makeDb({ categories: ['🍔'] });
    expect(() => normalizeIconColumns(db)).not.toThrow();
    expect(updates).toEqual([{ table: 'categories', to: 'meal', from: '🍔' }]);
  });

  it('is idempotent across a replayed migration', () => {
    // Simulate a second pass over the rewritten data: zero further UPDATEs.
    const rewritten = {
      categories: ['meal'],
      accounts: ['emoji:🎯'],
      budget_templates: ['grocery-basket'],
      monthly_budgets: ['car'],
    };
    const { db, updates } = makeDb(rewritten);
    normalizeIconColumns(db);
    expect(updates).toEqual([]);
  });
});
