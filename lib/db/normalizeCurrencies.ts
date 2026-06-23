import type { SQLiteDatabase } from 'expo-sqlite';

import { ALL_CURRENCIES } from '~/constants/appDefaults';

interface NormalizeOptions {
  /**
   * When true, every currency value is rewritten to the main currency code,
   * even values that happen to be valid ISO codes. Use this for data that is
   * known to predate multi-currency support (a legacy DB upgrade, or a restore
   * of a backup written by a single-currency build) — such data is
   * single-currency by definition, so a stray valid-looking code (e.g. a "USD"
   * placeholder left by an old default) must not be mistaken for a real
   * foreign-currency account.
   *
   * When false (default), only values that are *not* valid ISO codes are
   * rewritten — genuine multi-currency rows are preserved.
   */
  collapseAll?: boolean;
}

/**
 * Older app versions (and the Money Manager importer) stored a currency
 * *symbol* (e.g. "RM", "$") in the `currency` column instead of an ISO code
 * (e.g. "MYR"). Those apps were single-currency, so every non-code value
 * actually represents the user's main currency — even a generic "$" used as a
 * placeholder. So we map any value that isn't already a valid ISO code to the
 * main currency code. Real multi-currency rows (written by this app) always use
 * ISO codes and are left untouched — unless `collapseAll` is set, see above.
 *
 * Idempotent. Safe to run from a migration and after a backup restore / import.
 */
export function normalizeCurrencyColumns(db: SQLiteDatabase, options: NormalizeOptions = {}): void {
  const settings = db.getFirstSync<{ code: string | null; symbol: string | null }>(
    'SELECT currency_code AS code, currency_symbol AS symbol FROM settings LIMIT 1',
  );
  const mainCode = settings?.code || 'USD';

  const validCodes = new Set(ALL_CURRENCIES.map((c) => c.code));

  const resolve = (value: string): string =>
    options.collapseAll || !validCodes.has(value) ? mainCode : value;

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
