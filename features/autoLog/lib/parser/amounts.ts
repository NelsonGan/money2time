// Finding the money in an alert. An alert often carries several amounts (the
// payment, the remaining balance, a cashback teaser, a foreign-currency
// conversion); this finds every candidate with the currency it was written
// in, and the parser scores them to pick the payment. Pure.

import { CURRENCY_CODES, parseNumber } from '~/utils/moneyText';

import { escapeRegex, isWordChar } from './text';

export interface MoneyCandidate {
  /** Index of the first character of the whole match (token included). */
  start: number;
  /** Index just past the last character of the whole match. */
  end: number;
  /** Index range of the number itself. */
  numberStart: number;
  numberEnd: number;
  amount: number;
  /** Symbol or code as written, or null for a bare labelled number. */
  token: string | null;
  /** ISO code when the token names exactly one currency. */
  currency: string | null;
  /** How the candidate was found; explicit tokens are worth more. */
  via: 'iso' | 'symbol' | 'ambiguous_symbol' | 'label' | 'bare';
}

/**
 * Currency tokens and what they mean. A null code is a token that spans
 * several currencies (`$`, `¥`, `kr`, `Rs`): it still marks a number as money,
 * but the currency comes from the account instead.
 */
const TOKEN_CODES: Readonly<Record<string, string | null>> = {
  US$: 'USD',
  SG$: 'SGD',
  S$: 'SGD',
  HK$: 'HKD',
  NT$: 'TWD',
  AU$: 'AUD',
  A$: 'AUD',
  CA$: 'CAD',
  C$: 'CAD',
  NZ$: 'NZD',
  R$: 'BRL',
  RM: 'MYR',
  Rp: 'IDR',
  'Rs.': null,
  Rs: null,
  '₹': 'INR',
  '€': 'EUR',
  '£': 'GBP',
  '¥': null,
  '₩': 'KRW',
  '₫': 'VND',
  đ: 'VND',
  '₺': 'TRY',
  '฿': 'THB',
  '₱': 'PHP',
  '₪': 'ILS',
  '₦': 'NGN',
  '₴': 'UAH',
  '₽': 'RUB',
  $: null,
  人民币: 'CNY',
  RMB: 'CNY',
  zł: 'PLN',
  kr: null,
  Kč: 'CZK',
  Ft: 'HUF',
  lei: 'RON',
  円: 'JPY',
  元: null,
  원: 'KRW',
  บาท: 'THB',
};

/** Tokens written before the number. */
const PREFIX_TOKENS = [
  'US$',
  'SG$',
  'S$',
  'HK$',
  'NT$',
  'AU$',
  'A$',
  'CA$',
  'C$',
  'NZ$',
  'R$',
  'RM',
  'Rp',
  'Rs.',
  'Rs',
  '₹',
  '€',
  '£',
  '¥',
  '₩',
  '₫',
  '₺',
  '฿',
  '₱',
  '₪',
  '₦',
  '₴',
  '₽',
  '$',
  '人民币',
  'RMB',
];

/** Tokens written after the number. */
const SUFFIX_TOKENS = [
  '€',
  'zł',
  'kr',
  'Kč',
  'Ft',
  'lei',
  '円',
  '元',
  '원',
  'บาท',
  '₫',
  'đ',
  '₺',
  '₽',
  '$',
];

/**
 * A number as banks write amounts: grouped with `,` `.` `'` or a space, with an
 * optional decimal part. The trailing `(?!\d)` stops a reference number glued
 * after the amount from being read into it.
 */
const NUMBER = String.raw`(?:\d{1,3}(?:[, .']\d{3})+|\d+)(?:[.,]\d{1,3})?(?!\d)`;

function alternation(tokens: readonly string[]): string {
  return [...tokens]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');
}

const PREFIX_RE = new RegExp(`(${alternation(PREFIX_TOKENS)})\\s?(-)?\\s?(${NUMBER})`, 'gi');
const ISO_PREFIX_RE = new RegExp(`([A-Z]{3})\\s?(-)?\\s?(${NUMBER})`, 'g');
const SUFFIX_RE = new RegExp(`(${NUMBER})\\s?(${alternation(SUFFIX_TOKENS)}|[A-Z]{3})`, 'g');
const LABELLED_RE = new RegExp(
  `(?:amount|amt|jumlah|nilai|total|sebanyak|sejumlah|monto|valor|betrag|montant|importo|金额|金額|금액)\\s*[:：=]?\\s*(${NUMBER})`,
  'gi',
);
const BARE_DECIMAL_RE = /\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)|\d+\.\d{2}(?!\d)/g;

/** Tokens made of letters need a word boundary before them ("FROM 25" is not RM). */
function letterTokenBoundaryOk(text: string, tokenStart: number, token: string): boolean {
  if (!/^[A-Za-z]/.test(token)) return true;
  return !isWordChar(text[tokenStart - 1]);
}

function resolveToken(token: string): { code: string | null; known: boolean } {
  const direct = TOKEN_CODES[token];
  if (direct !== undefined) return { code: direct, known: true };
  // Tokens are matched case-insensitively ("rm 25"); map back to the table.
  const entry = Object.entries(TOKEN_CODES).find(
    ([key]) => key.toLowerCase() === token.toLowerCase(),
  );
  if (entry) return { code: entry[1], known: true };
  return { code: null, known: false };
}

/** Whether the characters right after a number make it a percentage or a time. */
function looksLikeNonMoney(text: string, numberEnd: number): boolean {
  const next = text.slice(numberEnd, numberEnd + 2);
  return /^\s?%/.test(next) || /^:\d/.test(next);
}

function viaFor(token: string, code: string | null): MoneyCandidate['via'] {
  if (/^[A-Z]{3}$/.test(token) && CURRENCY_CODES.has(token)) return 'iso';
  return code ? 'symbol' : 'ambiguous_symbol';
}

const VIA_RANK: Record<MoneyCandidate['via'], number> = {
  iso: 4,
  symbol: 3,
  ambiguous_symbol: 2,
  label: 1,
  bare: 0,
};

/** Every amount in the text, at most one per number, best-described first per number. */
export function findMoneyCandidates(text: string): MoneyCandidate[] {
  const byNumber = new Map<number, MoneyCandidate>();

  const keep = (candidate: MoneyCandidate) => {
    if (!(candidate.amount > 0) || looksLikeNonMoney(text, candidate.numberEnd)) return;
    const existing = byNumber.get(candidate.numberStart);
    if (!existing || VIA_RANK[candidate.via] > VIA_RANK[existing.via]) {
      byNumber.set(candidate.numberStart, candidate);
    }
  };

  PREFIX_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PREFIX_RE.exec(text)) !== null) {
    const token = match[1] ?? '';
    const raw = match[3] ?? '';
    if (!letterTokenBoundaryOk(text, match.index, token)) continue;
    const { code, known } = resolveToken(token);
    if (!known) continue;
    const numberStart = match.index + match[0].length - raw.length;
    const amount = parseNumber(raw, { currency: code });
    if (amount === null) continue;
    keep({
      start: match.index,
      end: match.index + match[0].length,
      numberStart,
      numberEnd: numberStart + raw.length,
      amount,
      token,
      currency: code,
      via: viaFor(token, code),
    });
  }

  ISO_PREFIX_RE.lastIndex = 0;
  while ((match = ISO_PREFIX_RE.exec(text)) !== null) {
    const token = match[1] ?? '';
    const raw = match[3] ?? '';
    if (!CURRENCY_CODES.has(token) || isWordChar(text[match.index - 1])) continue;
    const numberStart = match.index + match[0].length - raw.length;
    const amount = parseNumber(raw, { currency: token });
    if (amount === null) continue;
    keep({
      start: match.index,
      end: match.index + match[0].length,
      numberStart,
      numberEnd: numberStart + raw.length,
      amount,
      token,
      currency: token,
      via: 'iso',
    });
  }

  SUFFIX_RE.lastIndex = 0;
  while ((match = SUFFIX_RE.exec(text)) !== null) {
    const raw = match[1] ?? '';
    const token = match[2] ?? '';
    const before = text[match.index - 1];
    if (before && /[\d.,]/.test(before)) continue;
    const after = text[match.index + match[0].length];
    if (/^[A-Za-z]/.test(token) && isWordChar(after)) continue;
    let code: string | null;
    if (/^[A-Z]{3}$/.test(token)) {
      if (!CURRENCY_CODES.has(token)) continue;
      code = token;
    } else {
      const resolved = resolveToken(token);
      if (!resolved.known) continue;
      code = resolved.code;
    }
    const amount = parseNumber(raw, { currency: code });
    if (amount === null) continue;
    keep({
      start: match.index,
      end: match.index + match[0].length,
      numberStart: match.index,
      numberEnd: match.index + raw.length,
      amount,
      token,
      currency: code,
      via: viaFor(token, code),
    });
  }

  LABELLED_RE.lastIndex = 0;
  while ((match = LABELLED_RE.exec(text)) !== null) {
    const raw = match[1] ?? '';
    const numberStart = match.index + match[0].length - raw.length;
    const amount = parseNumber(raw);
    if (amount === null) continue;
    keep({
      start: match.index,
      end: match.index + match[0].length,
      numberStart,
      numberEnd: numberStart + raw.length,
      amount,
      token: null,
      currency: null,
      via: 'label',
    });
  }

  // Only when nothing explicit was found: an unlabelled "25.00" is still most
  // likely the amount in an alert that names no currency at all.
  if (byNumber.size === 0) {
    BARE_DECIMAL_RE.lastIndex = 0;
    while ((match = BARE_DECIMAL_RE.exec(text)) !== null) {
      const before = text[match.index - 1];
      if (before && /[\d/:-]/.test(before)) continue;
      const amount = parseNumber(match[0]);
      if (amount === null) continue;
      keep({
        start: match.index,
        end: match.index + match[0].length,
        numberStart: match.index,
        numberEnd: match.index + match[0].length,
        amount,
        token: null,
        currency: null,
        via: 'bare',
      });
    }
  }

  return [...byNumber.values()].sort((a, b) => a.start - b.start);
}
