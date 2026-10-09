import { MAJOR_CURRENCIES } from '~/constants/appDefaults';

export interface ParsedQuickInput {
  amount: number | null;
  note: string;
}

const NUMBER_TOKEN_PATTERN = /(?:^|\s)([+\-]?\d{1,12}(?:[.,]\d{1,4})?)(?=\s|$)/g;
const NUMBER_ANYWHERE_PATTERN = /([+\-]?\d{1,12}(?:[.,]\d{1,4})?)/;

function toNumber(token: string): number | null {
  const normalized = token.replace(/,/g, '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.abs(value);
}

export function parseQuickInput(raw: string): ParsedQuickInput {
  const trimmed = raw.trim();
  if (!trimmed) return { amount: null, note: '' };

  const standaloneNumbers: { token: string; start: number; end: number }[] = [];
  for (const match of trimmed.matchAll(NUMBER_TOKEN_PATTERN)) {
    const token = match[1];
    const leadOffset = match[0].length - token.length;
    const start = (match.index ?? 0) + leadOffset;
    const end = start + token.length;
    standaloneNumbers.push({ token, start, end });
  }

  if (standaloneNumbers.length > 0) {
    const pick = standaloneNumbers[standaloneNumbers.length - 1];
    const amount = toNumber(pick.token);
    const note = (trimmed.slice(0, pick.start) + ' ' + trimmed.slice(pick.end))
      .replace(/\s+/g, ' ')
      .trim();
    return { amount, note };
  }

  const fallback = trimmed.match(NUMBER_ANYWHERE_PATTERN);
  if (fallback) {
    const token = fallback[1];
    const start = fallback.index ?? 0;
    const end = start + token.length;
    const amount = toNumber(token);
    const note = (trimmed.slice(0, start) + trimmed.slice(end)).replace(/\s+/g, ' ').trim();
    return { amount, note };
  }

  return { amount: null, note: trimmed };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CURRENCY_SYMBOLS = Array.from(new Set(MAJOR_CURRENCIES.map((c) => c.symbol)));
// Letter-bearing symbols (RM, Rp, HK$, kr …) are stripped only as whole tokens
// so real words survive. Precompiled longest-first so a multi-char symbol is
// tried before any shorter symbol that overlaps it.
const ALPHA_CURRENCY_RES = CURRENCY_SYMBOLS.filter((s) => s.length >= 2 && /[a-z]/i.test(s))
  .sort((a, b) => b.length - a.length)
  .map((s) => new RegExp(`(?:^|\\s)${escapeRegex(s)}(?=\\s|$)`, 'gi'));
// Pure glyphs ($, ¥, €, ₹ …) are safe to remove anywhere, including when the
// speech engine glues them to the amount or note ("¥16", "茶¥").
const PURE_CURRENCY_SYMBOL_RE = new RegExp(
  CURRENCY_SYMBOLS.filter((s) => !/[a-z]/i.test(s))
    .map(escapeRegex)
    .join('|'),
  'g',
);

/**
 * Strip currency symbols that speech recognition prepends to a spoken amount
 * (e.g. "$30", "RM20", "¥16.90"). parseQuickInput removes the number but leaves
 * the currency glyph dangling in the note; voice entry runs the note through
 * this so notes and keyword categorization stay clean. (Reusing the global
 * regexes across calls is safe — String.replace resets lastIndex each time.)
 */
export function stripCurrencyTokens(note: string): string {
  let out = note;
  for (const re of ALPHA_CURRENCY_RES) {
    out = out.replace(re, ' ');
  }
  out = out.replace(PURE_CURRENCY_SYMBOL_RE, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Replace just the note portion of `originalText` with `newNote`, preserving
 * the user's amount position. Returns `newNote` if no amount is present.
 */
export function replaceNoteInQuickInput(originalText: string, newNote: string): string {
  const trimmed = originalText.trim();
  if (!trimmed) return newNote;

  let amountToken: string | null = null;
  let amountStart = -1;
  let amountEnd = -1;
  let lastMatch: RegExpExecArray | null = null;
  for (const m of trimmed.matchAll(NUMBER_TOKEN_PATTERN)) {
    lastMatch = m as unknown as RegExpExecArray;
  }
  if (lastMatch) {
    amountToken = lastMatch[1];
    const leadOffset = lastMatch[0].length - amountToken.length;
    amountStart = (lastMatch.index ?? 0) + leadOffset;
    amountEnd = amountStart + amountToken.length;
  } else {
    const fallback = trimmed.match(NUMBER_ANYWHERE_PATTERN);
    if (fallback) {
      amountToken = fallback[1];
      amountStart = fallback.index ?? 0;
      amountEnd = amountStart + amountToken.length;
    }
  }

  if (amountToken == null) return newNote;

  const before = trimmed.slice(0, amountStart).trim();
  const after = trimmed.slice(amountEnd).trim();

  // amount at start (and only at start): "20 he" → "20 newNote"
  if (before.length === 0) return `${amountToken} ${newNote}`;
  // amount at end (and only at end): "he 20" → "newNote 20"
  if (after.length === 0) return `${newNote} ${amountToken}`;
  // amount somewhere in the middle: preserve "newNote amount" ordering
  return `${newNote} ${amountToken}`;
}
