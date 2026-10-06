// Read the Apple Pay Shortcut's structured Amount string, and validate currency
// codes returned by notification inference. Pure; Apple Pay parsing is covered
// by __tests__/features/autoLog.test.ts.

import { ALL_CURRENCIES } from '~/constants/appDefaults';

export const CURRENCY_CODES: ReadonlySet<string> = new Set(
  ALL_CURRENCIES.map((entry) => entry.code),
);

/**
 * Symbols that map to exactly one currency.
 *
 * `$`, `¥` and `kr` are deliberately absent: `$` spans USD/CAD/AUD/SGD/NZD/HKD,
 * `¥` spans JPY/CNY, and `kr` spans SEK/NOK/DKK/ISK. Amounts are formatted in
 * the device or bank locale, so guessing from an ambiguous symbol would
 * silently mislabel every non-US payment. Returning null instead lets the
 * caller use the account's own currency, which is what the card is tied to.
 */
export const UNAMBIGUOUS_SYMBOLS: readonly (readonly [string, string])[] = [
  ['R$', 'BRL'],
  ['RM', 'MYR'],
  ['Rp', 'IDR'],
  ['zł', 'PLN'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['₹', 'INR'],
  ['₩', 'KRW'],
  ['₫', 'VND'],
  ['₺', 'TRY'],
  ['฿', 'THB'],
  ['₱', 'PHP'],
  ['₪', 'ILS'],
  ['₦', 'NGN'],
  ['₴', 'UAH'],
];

/** An explicit ISO code in the string beats a symbol; both beat nothing. */
export function detectCurrency(raw: string): string | null {
  for (const match of raw.toUpperCase().matchAll(/[A-Z]{3}/g)) {
    if (CURRENCY_CODES.has(match[0])) return match[0];
  }
  for (const [symbol, code] of UNAMBIGUOUS_SYMBOLS) {
    if (raw.includes(symbol)) return code;
  }
  return null;
}

/**
 * Currencies whose minor unit is three digits (ISO 4217). Every other currency
 * is read with at most two decimals; the zero-decimal ones (JPY, KRW, IDR as
 * written in practice) already parse correctly because their grouped amounts
 * ("1,200", "50.000") take the thousands branch below.
 */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function minorUnitDigits(currency: string | null | undefined): 2 | 3 {
  return currency && THREE_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 3 : 2;
}

export interface ParseNumberOptions {
  /**
   * The currency the number is known to be in, when the caller knows it. Only
   * changes the outcome for the three-decimal currencies, where "1.250" is one
   * and a quarter rather than twelve hundred and fifty.
   */
  currency?: string | null;
}

/**
 * Read the numeric value out of a locale-formatted amount, handling both
 * `1,234.56` and `1.234,56`.
 */
export function parseNumber(raw: string, options: ParseNumberOptions = {}): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return null;

  const digits = cleaned.replace(/-/g, '');
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const maxDecimals = minorUnitDigits(options.currency);

  let decimalSep: string | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present, so the rightmost is the decimal mark and the other groups.
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const occurrences = digits.split(sep).length - 1;
    const tail = digits.slice(digits.lastIndexOf(sep) + 1);
    // A lone separator trailed by exactly three digits is a thousands mark
    // ("1,234" and "1.234" both mean 1234), because currency amounts carry at
    // most two decimals. The three-decimal currencies are the exception, and
    // only when the caller says the amount is in one of them.
    const isDecimal = tail.length !== 3 || maxDecimals === 3;
    decimalSep = occurrences === 1 && isDecimal ? sep : null;
  }

  const normalized = decimalSep
    ? `${digits.slice(0, digits.lastIndexOf(decimalSep)).replace(/[.,]/g, '')}.${digits
        .slice(digits.lastIndexOf(decimalSep) + 1)
        .replace(/[.,]/g, '')}`
    : digits.replace(/[.,]/g, '');

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
