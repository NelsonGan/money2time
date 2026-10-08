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
const unlabelled = new RegExp(`(^|[^0-9.,-])(${number})(?![\\d]|[.,]\\d)`, 'g');

function readAmount(raw: string, currency: string): NotificationAmount | null {
  const decimals = minorUnitDigits(currency);
  // Validate grouping before the shared regional number parser strips it.
  const plain = new RegExp(`^\\d+(?:[.,]\\d{1,${decimals}})?$`);
  const grouped = new RegExp(
    `^\\d{1,3}([., \\u00a0])\\d{3}(?:\\1\\d{3})*(?:([.,])\\d{1,${decimals}})?$`,
  );
  const indian = new RegExp(`^\\d{1,2}(?:,\\d{2})*,\\d{3}(?:\\.\\d{1,${decimals}})?$`);
  const grouping = grouped.exec(raw);
  if (!plain.test(raw) && (!grouping || grouping[1] === grouping[2]) && !indian.test(raw))
    return null;
  const amount = parseNumber(raw, { currency });
  const value = { amount, currency };
  return isValidNotificationAmount(value) ? value : null;
}

/** Money candidates only. Direction, completion and relevance are always the user's decision. */
export function extractNotificationAmounts(
  text: string,
  fallbackCurrency: string,
): NotificationAmount[] {
  // Numeric writing varies independently of the account's currency.
  const normalized = text
    .replace(/[\u0660-\u0669\u06f0-\u06f9\uff10-\uff19]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code - (code >= 0xff10 ? 0xff10 : code >= 0x06f0 ? 0x06f0 : 0x0660));
    })
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/\u202f/g, '\u00a0');
  const found: { index: number; value: NotificationAmount }[] = [];
  const labelledRanges: { start: number; end: number }[] = [];
  for (const [regex, isPrefix] of [
    [prefix, true],
    [suffix, false],
  ] as const) {
    regex.lastIndex = 0;
    for (const match of normalized.matchAll(regex)) {
      labelledRanges.push({ start: match.index, end: match.index + match[0].length });
      const token = (isPrefix ? match[2] : match[3]).toUpperCase();
      const raw = (isPrefix ? match[3] : match[2]).trim();
      const currency = CURRENCY_CODES.has(token) ? token : (symbols.get(token) ?? fallbackCurrency);
      const value = readAmount(raw, currency);
      if (value) found.push({ index: match.index, value });
    }
  }
  unlabelled.lastIndex = 0;
  for (const match of normalized.matchAll(unlabelled)) {
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    // Explicit currencies win. Even a malformed labelled amount must not be
    // reinterpreted as a valid number in the account's fallback currency.
    if (labelledRanges.some((range) => start < range.end && end > range.start)) continue;
    const before = normalized.slice(Math.max(0, start - 64), start);
    const after = normalized.slice(end, end + 32);
    // Exclude numeric identifiers, dates/times, percentages and reward points.
    // These guards identify numbers; they never classify a notification or its direction.
    if (
      /\d\s*[/:]\s*$|\-\s*$|\d[eE][+-]?\s*$/.test(before) ||
      /^[/:\-]\d/.test(after) ||
      /[A-Za-z]{2,}$|[a-z]$|[0-9][A-Za-z]$/.test(before) ||
      /^[A-Za-z0-9]/.test(after) ||
      /^\s*(?:%|points?\b|pts\b)/i.test(after) ||
      /\b(?:otp|code|ref(?:erence)?|card|account|acct|id|invoice|phone|tel)(?:\s+(?:number|no\.?|is|ending|ends|in|with))*[\s:#*.\-+]*$/i.test(
        before,
      )
    )
      continue;
    const value = readAmount(match[2].trim(), fallbackCurrency);
    if (value) found.push({ index: start, value });
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
