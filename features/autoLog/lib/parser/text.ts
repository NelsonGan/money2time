// Text plumbing for the payment-alert parser: normalizing what a notification
// hands over, and matching lexicons against it. Pure.

import type { Lexicon } from './lexicons';

/** Characters that make up a word in the scripts lexicon words are written in. */
export const WORD_CHAR_CLASS = 'A-Za-z0-9\\u00C0-\\u024F\\u1E00-\\u1EFF';
const WORD_CHAR = new RegExp(`[${WORD_CHAR_CLASS}]`);

/** Longest text the parser looks at; real alerts are a few hundred characters. */
export const MAX_ALERT_TEXT_LENGTH = 2000;

const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isWordChar(char: string | undefined): boolean {
  return !!char && WORD_CHAR.test(char);
}

/** Email bodies arrive as HTML through the iOS Email automation. */
function stripHtml(value: string): string {
  if (!/<\/?[a-z][^>]*>/i.test(value)) return value;
  return value
    .replace(/<(br|\/p|\/div|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(HTML_TAG, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => {
      const known = HTML_ENTITIES[entity.toLowerCase()];
      if (known !== undefined) return known;
      const numeric = /^&#(x?)([0-9a-f]+);$/i.exec(entity);
      if (!numeric) return ' ';
      const code = parseInt(numeric[2] ?? '', numeric[1] ? 16 : 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    });
}

/**
 * Compatibility-normalize so full-width digits and symbols in CJK alerts read
 * as their ASCII forms. Hermes implements `normalize`, but a missing or
 * throwing implementation must never cost an alert, so the digits are mapped
 * by hand as a fallback.
 */
export function toCompatibilityForm(value: string): string {
  try {
    if (typeof value.normalize === 'function') return value.normalize('NFKC');
  } catch {
    // Fall through to the manual mapping.
  }
  return value
    .replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/\uFF0E/g, '.')
    .replace(/\uFF0C/g, ',')
    .replace(/\uFFE5/g, '¥')
    .replace(/\uFF1A/g, ':');
}

export interface NormalizedAlert {
  /** Single-spaced, one line per original line, compatibility-normalized. */
  text: string;
  /** `text` lowercased, index-aligned with it. */
  lower: string;
}

/** Join an alert's parts (title, subtitle, body, …) into one parseable text. */
export function normalizeAlertText(parts: readonly (string | null | undefined)[]): NormalizedAlert {
  const joined = parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join('\n');

  const text = toCompatibilityForm(stripHtml(joined))
    .replace(/\r\n?/g, '\n')
    // Every horizontal space, including no-break and thin spaces used as digit
    // grouping, becomes a plain space; the amount pattern accepts that as a
    // thousands separator.
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .slice(0, MAX_ALERT_TEXT_LENGTH);

  // toLowerCase can change length for a handful of characters (e.g. the
  // dotted capital I); fall back to a per-character lowercase so indices stay
  // aligned with `text`.
  const lowered = text.toLowerCase();
  const lower =
    lowered.length === text.length
      ? lowered
      : Array.from(text, (char) => {
          const low = char.toLowerCase();
          return low.length === char.length ? low : char;
        }).join('');

  return { text, lower };
}

export interface CompiledLexicon {
  pattern: RegExp | null;
  substrings: readonly string[];
}

export interface LexiconHit {
  /** Index in the lowercased text where the matched word starts. */
  index: number;
  word: string;
}

/**
 * Lexicon entries go through the same compatibility normalization as alert
 * text, or a word whose characters NFKC rewrites (Thai SARA AM, for one) would
 * never match the normalized alert.
 */
export function compileLexicon(lexicon: Lexicon): CompiledLexicon {
  const words = [...new Set(lexicon.words.map((word) => toCompatibilityForm(word).toLowerCase()))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  return {
    pattern: words.length
      ? new RegExp(
          `(?:^|[^${WORD_CHAR_CLASS}])(${words.join('|')})(?=$|[^${WORD_CHAR_CLASS}])`,
          'g',
        )
      : null,
    substrings: lexicon.substrings.map((value) => toCompatibilityForm(value).toLowerCase()),
  };
}

/** Every place a lexicon matches in the lowercased text, in order. */
export function findLexiconHits(lower: string, lexicon: CompiledLexicon): LexiconHit[] {
  const hits: LexiconHit[] = [];
  if (lexicon.pattern) {
    lexicon.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = lexicon.pattern.exec(lower)) !== null) {
      const word = match[1] ?? '';
      hits.push({ index: match.index + match[0].length - word.length, word });
    }
  }
  for (const substring of lexicon.substrings) {
    let from = 0;
    while (from <= lower.length) {
      const index = lower.indexOf(substring, from);
      if (index < 0) break;
      hits.push({ index, word: substring });
      from = index + substring.length;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Whole-word, case-insensitive containment, for user-entered names. */
export function containsWords(lower: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  let from = 0;
  while (from <= lower.length) {
    const index = lower.indexOf(needle, from);
    if (index < 0) return false;
    const before = lower[index - 1];
    const after = lower[index + needle.length];
    const startsWithWordChar = isWordChar(needle[0]);
    const endsWithWordChar = isWordChar(needle[needle.length - 1]);
    const leftOk = !startsWithWordChar || !isWordChar(before);
    const rightOk = !endsWithWordChar || !isWordChar(after);
    if (leftOk && rightOk) return true;
    from = index + 1;
  }
  return false;
}
