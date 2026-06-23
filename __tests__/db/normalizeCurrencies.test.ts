import type { SQLiteDatabase } from 'expo-sqlite';

import { normalizeCurrencyColumns } from '~/lib/db/normalizeCurrencies';

interface Update {
  table: string;
  to: string;
  from: string;
}

function makeDb(
  settings: { code: string | null; symbol: string | null } | null,
  tableCurrencies: Record<string, (string | null)[]>,
): { db: SQLiteDatabase; updates: Update[] } {
  const updates: Update[] = [];
  const db = {
    getFirstSync: () => settings,
    getAllSync: (sql: string) => {
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
      return (tableCurrencies[table] ?? []).map((currency) => ({ currency }));
    },
    runSync: (sql: string, params: unknown[]) => {
      const table = /UPDATE (\w+)/.exec(sql)?.[1] ?? '';
      updates.push({ table, to: params[0] as string, from: params[1] as string });
    },
  } as unknown as SQLiteDatabase;
  return { db, updates };
}

describe('normalizeCurrencyColumns', () => {
  it('maps the main currency symbol to its ISO code', () => {
    const { db, updates } = makeDb({ code: 'MYR', symbol: 'RM' }, { accounts: ['RM'] });
    normalizeCurrencyColumns(db);
    expect(updates).toContainEqual({ table: 'accounts', to: 'MYR', from: 'RM' });
  });

  it('leaves valid ISO codes untouched', () => {
    const { db, updates } = makeDb(
      { code: 'MYR', symbol: 'RM' },
      { accounts: ['EUR', 'MYR'], transactions: ['USD'] },
    );
    normalizeCurrencyColumns(db);
    expect(updates).toHaveLength(0);
  });

  it('maps any non-code symbol (incl. a generic "$") to the main code', () => {
    // Legacy single-currency data used the symbol as a placeholder, so it all
    // belongs to the main currency — never inferred as USD/EUR/etc.
    const { db, updates } = makeDb(
      { code: 'MYR', symbol: 'RM' },
      { transactions: ['$', '€', '¥'] },
    );
    normalizeCurrencyColumns(db);
    expect(updates).toContainEqual({ table: 'transactions', to: 'MYR', from: '$' });
    expect(updates).toContainEqual({ table: 'transactions', to: 'MYR', from: '€' });
    expect(updates).toContainEqual({ table: 'transactions', to: 'MYR', from: '¥' });
  });

  it('collapses a stray valid ISO code to the main code when collapseAll is set', () => {
    // Pre-multi-currency data: a stray "USD" left by an old default template is
    // not a real foreign account, so it must collapse to the main currency.
    const { db, updates } = makeDb({ code: 'MYR', symbol: 'RM' }, { accounts: ['RM', 'USD'] });
    normalizeCurrencyColumns(db, { collapseAll: true });
    expect(updates).toContainEqual({ table: 'accounts', to: 'MYR', from: 'RM' });
    expect(updates).toContainEqual({ table: 'accounts', to: 'MYR', from: 'USD' });
  });

  it('preserves valid ISO codes when collapseAll is not set', () => {
    const { db, updates } = makeDb({ code: 'MYR', symbol: 'RM' }, { accounts: ['RM', 'USD'] });
    normalizeCurrencyColumns(db, { collapseAll: false });
    expect(updates).toContainEqual({ table: 'accounts', to: 'MYR', from: 'RM' });
    expect(updates).not.toContainEqual({ table: 'accounts', to: 'MYR', from: 'USD' });
  });
});
