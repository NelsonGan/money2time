import { CURRENCY_CODES, minorUnitDigits, parseNumber, UNAMBIGUOUS_SYMBOLS } from './moneyText';

export interface NotificationAmount {
  amount: number;
  currency: string;
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const symbols = new Map(UNAMBIGUOUS_SYMBOLS.map(([symbol, code]) => [symbol.toUpperCase(), code]));
const tokens = [...CURRENCY_CODES, ...symbols.keys(), '$', '¥', 'Rs', 'kr']
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');
const number = '-?\\d(?:[\\d., \\u00a0]*\\d)?';
const prefix = new RegExp(`(^|[^A-Za-z0-9])(${tokens})\\s*(${number})(?![\\d]|[.,]\\d)`, 'gi');
const suffix = new RegExp(`(^|[^A-Za-z0-9.,-])(${number})\\s*(${tokens})(?![A-Za-z])`, 'gi');

/** Money candidates only. Direction, completion and relevance are always the user's decision. */
export function extractNotificationAmounts(
  text: string,
  fallbackCurrency: string,
): NotificationAmount[] {
  const found: { index: number; value: NotificationAmount }[] = [];
  for (const [regex, isPrefix] of [
    [prefix, true],
    [suffix, false],
  ] as const) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const token = (isPrefix ? match[2] : match[3]).toUpperCase();
      const raw = (isPrefix ? match[3] : match[2]).trim();
      const currency = CURRENCY_CODES.has(token) ? token : (symbols.get(token) ?? fallbackCurrency);
      const decimals = minorUnitDigits(currency);
      // Validate grouping before the shared regional number parser strips it.
      const plain = new RegExp(`^\\d+(?:[.,]\\d{1,${decimals}})?$`);
      const grouped = new RegExp(
        `^\\d{1,3}([., \\u00a0])\\d{3}(?:\\1\\d{3})*(?:([.,])\\d{1,${decimals}})?$`,
      );
      const indian = new RegExp(`^\\d{1,2}(?:,\\d{2})*,\\d{3}(?:\\.\\d{1,${decimals}})?$`);
      const grouping = grouped.exec(raw);
      if (!plain.test(raw) && (!grouping || grouping[1] === grouping[2]) && !indian.test(raw))
        continue;
      const amount = parseNumber(raw, { currency });
      if (amount === null || !isValidNotificationAmount({ amount, currency })) continue;
      found.push({ index: match.index ?? 0, value: { amount, currency } });
    }
  }
  const unique = new Map<string, NotificationAmount>();
  for (const { value } of found.sort((a, b) => a.index - b.index)) {
    unique.set(`${value.currency}:${value.amount}`, value);
  }
  return [...unique.values()];
}

/** Validate monetary precision before saving, including currencies with three minor digits. */
export function isValidNotificationAmount(value: unknown): value is NotificationAmount {
  if (!value || typeof value !== 'object') return false;
  const { amount, currency } = value as NotificationAmount;
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof currency !== 'string' ||
    !CURRENCY_CODES.has(currency)
  )
    return false;
  const scaled = amount * 10 ** minorUnitDigits(currency);
  return (
    Number.isSafeInteger(Math.round(amount * 1000)) &&
    Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2
  );
}

/** Editable amounts have no grouping: never turn an invalid decimal into thousands. */
export function parseNotificationReviewAmount(
  text: string,
  currency: string,
): NotificationAmount | null {
  const decimals = minorUnitDigits(currency);
  if (!new RegExp(`^\\d+(?:[.,]\\d{0,${decimals}})?$`).test(text.trim())) return null;
  const amount = parseNumber(text, { currency });
  const value = { amount, currency };
  return isValidNotificationAmount(value) ? value : null;
}
