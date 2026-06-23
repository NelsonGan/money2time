import { ALL_CURRENCIES } from '~/constants/appDefaults';
import type { ExchangeRate, RateTable } from '~/types';

import { normalizeMoneyAmount } from './formatters';

const EMPTY_RATE_TABLE: RateTable = { base: 'USD', rates: { USD: 1 }, asOfDate: null };

/**
 * Build an in-memory {@link RateTable} relative to `base` from cached rows.
 * Rows already keyed to `base` are used directly (`1 base = rate quote`); rows
 * keyed the other way (`quote === base`) are inverted. Rows for other bases are
 * ignored.
 */
export function buildRateTable(base: string, rows: ExchangeRate[]): RateTable {
  const rates: Record<string, number> = { [base]: 1 };
  let asOfDate: string | null = null;

  for (const row of rows) {
    if (row.asOfDate && (!asOfDate || row.asOfDate > asOfDate)) {
      asOfDate = row.asOfDate;
    }
    if (row.baseCurrency === base) {
      rates[row.quoteCurrency] = row.rate;
    } else if (row.quoteCurrency === base && row.rate !== 0) {
      // Row stores `1 row.base = rate base`, so `1 base = 1/rate row.base`.
      rates[row.baseCurrency] = 1 / row.rate;
    }
  }

  return { base, rates, asOfDate };
}

export const emptyRateTable = (base = 'USD'): RateTable => ({
  ...EMPTY_RATE_TABLE,
  base,
  rates: { [base]: 1 },
});

export interface ConvertResult {
  /** Converted value, or the original amount when no rate was available. */
  value: number;
  /** The rate applied (`from -> to`), or null when conversion was not possible. */
  rateUsed: number | null;
}

/**
 * Resolve the rate `from -> to` (i.e. `1 from = rate to`) using a rate table
 * whose entries are all relative to `table.base`. Returns null when either leg
 * is missing.
 */
export function resolveRate(from: string, to: string, table: RateTable): number | null {
  if (from === to) return 1;
  const fromRate = from === table.base ? 1 : table.rates[from];
  const toRate = to === table.base ? 1 : table.rates[to];
  if (fromRate === undefined || toRate === undefined || fromRate === 0) return null;
  // `1 from = (1/fromRate) base` and `1 base = toRate to`.
  return (1 / fromRate) * toRate;
}

/**
 * Convert `amount` from one currency to another using the cached rate table.
 * Identity when `from === to`. When no rate is available the input amount is
 * returned unchanged with `rateUsed: null` so callers can badge/omit it rather
 * than silently showing a wrong number.
 */
export function convert(amount: number, from: string, to: string, table: RateTable): ConvertResult {
  if (from === to) return { value: normalizeMoneyAmount(amount), rateUsed: 1 };
  const rate = resolveRate(from, to, table);
  if (rate === null) return { value: amount, rateUsed: null };
  return { value: normalizeMoneyAmount(amount * rate), rateUsed: rate };
}

const currencyByCode = new Map(ALL_CURRENCIES.map((c) => [c.code, c]));

/** Currency codes supported by the Frankfurter (ECB) feed. */
export const FRANKFURTER_SUPPORTED = new Set<string>([
  'AUD',
  'BGN',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
]);

/** Currencies in the app picker that the Frankfurter feed does not cover. */
export function isAutoRateSupported(code: string): boolean {
  return FRANKFURTER_SUPPORTED.has(code);
}

export function currencySymbolForCode(code: string): string {
  return currencyByCode.get(code)?.symbol ?? code;
}

export function currencyNameForCode(code: string): string {
  return currencyByCode.get(code)?.name ?? code;
}
