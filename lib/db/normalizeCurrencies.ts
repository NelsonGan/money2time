import type { SQLiteDatabase } from 'expo-sqlite';

import { ALL_CURRENCIES } from '~/constants/appDefaults';

/**
 * Older app versions (and the Money Manager importer) stored a currency
 * *symbol* (e.g. "RM", "$") in the `currency` column instead of an ISO code
 * (e.g. "MYR"). Those apps were single-currency, so every non-code value
 * actually represents the user's main currency — even a generic "$" used as a
 * placeholder. So we map any value that isn't already a valid ISO code to the
 * main currency code. Real multi-currency rows (written by this app) always use
 * ISO codes and are left untouched.
 *
 * Idempotent. Safe to run from a migration and after a backup restore / import.
 */
export function normalizeCurrencyColumns(db: SQLiteDatabase): void {
  const settings = db.getFirstSync<{ code: string | null; symbol: string | null }>(
    'SELECT currency_code AS code, currency_symbol AS symbol FROM settings LIMIT 1',
  );
  const mainCode = settings?.code || 'USD';

  const validCodes = new Set(ALL_CURRENCIES.map((c) => c.code));

  const resolve = (value: string): string => (validCodes.has(value) ? value : mainCode);

  for (const table of ['accounts', 'transactions', 'recurring_rules']) {
    const rows = db.getAllSync<{ currency: string | null }>(
      `SELECT DISTINCT currency FROM ${table}`,
    );
    for (const row of rows) {
      const current = row.currency;
      if (current == null) continue;
      const next = resolve(current);
      if (next !== current) {
        db.runSync(`UPDATE ${table} SET currency = ? WHERE currency = ?`, [next, current]);
      }
    }
  }
}
