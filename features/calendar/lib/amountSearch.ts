import type { TransactionWithRelations } from '~/types';

/**
 * An amount the user typed into search, reduced to the digits the list would
 * show: `whole` is the integer part without grouping, `fraction` is whatever
 * followed the decimal point (possibly empty, as in "12."), or null when no
 * decimal point was typed.
 */
export type AmountQuery = { whole: string; fraction: string | null };

// What a user might type around a number: a currency sign or a short code
// ("RM", "USD", "S$"), spaces (including the narrow no-break space some
// locales group with) and a leading sign. A run of more than three letters is
// a word, so "7-eleven" or "12 apples" stay text.
const NON_NUMERIC_EDGES =
  /^[^A-Za-z\d.,]*[A-Za-z]{0,3}[^A-Za-z\d.,]*|[^A-Za-z\d.,]*[A-Za-z]{0,3}[^A-Za-z\d.,]*$/g;

/**
 * Reads a search query as an amount, or returns null when it is not one (so
 * "coffee" or "7-eleven" keep searching text only).
 *
 * The list always renders money as `1,234.50`, but a user in a comma-decimal
 * locale will type `12,50`, so a comma is read as the decimal point when it is
 * the only separator and is followed by one or two digits. A comma followed by
 * three digits is grouping, as it is in the rendered amount.
 */
export function parseAmountQuery(query: string): AmountQuery | null {
  const trimmed = query.trim().replace(NON_NUMERIC_EDGES, '');
  if (!/^[\d.,]+$/.test(trimmed) || !/\d/.test(trimmed)) return null;

  let normalized = trimmed;
  const lastDot = normalized.lastIndexOf('.');
  const lastComma = normalized.lastIndexOf(',');
  if (lastDot === -1 && lastComma !== -1 && /,\d{0,2}$/.test(normalized)) {
    // "12,5" / "12,50" / "12," typed as a decimal comma.
    const commaCount = normalized.split(',').length - 1;
    if (commaCount !== 1) return null;
    normalized = normalized.replace(',', '.');
  } else if (lastComma > lastDot && lastDot !== -1) {
    // "1.234,50": dots group, the trailing comma is the decimal point.
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (lastComma === -1 && /^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    // "1.234" / "1.234.567": dot grouping. Three decimals is never an amount.
    normalized = normalized.replace(/\./g, '');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const parts = normalized.split('.');
  if (parts.length > 2) return null;
  const whole = parts[0].replace(/^0+(?=\d)/, '');
  const fraction = parts.length === 2 ? parts[1] : null;
  if (whole === '' && (fraction === null || fraction === '')) return null;
  if (fraction !== null && fraction.length > 2) return null;
  return { whole: whole === '' ? '0' : whole, fraction };
}

/** `12.5` -> `"12.50"`: the digits of an amount as the list shows it. */
export function amountSearchKey(amount: number): string {
  return Math.abs(amount).toFixed(2);
}

/**
 * The shown amounts of a transaction: its own amount, and its reporting
 * amount when that differs (a foreign-currency row shows both).
 */
export function transactionAmountSearchKeys(tx: TransactionWithRelations): string[] {
  const keys = [amountSearchKey(tx.amount)];
  if (tx.reportingAmount != null) {
    const reportingKey = amountSearchKey(tx.reportingAmount);
    if (reportingKey !== keys[0]) keys.push(reportingKey);
  }
  return keys;
}

/**
 * A whole number matches every amount with that integer part ("12" finds
 * 12.00 to 12.99), and a decimal matches by the cents typed so far ("12.5"
 * finds 12.50 to 12.59, "12.50" only 12.50). Typing "1" never floods the list
 * with 100 or 1,000, which a plain substring match would.
 */
export function amountKeyMatches(key: string, query: AmountQuery): boolean {
  const dot = key.indexOf('.');
  if (key.slice(0, dot) !== query.whole) return false;
  if (query.fraction === null) return true;
  return key.slice(dot + 1).startsWith(query.fraction);
}
