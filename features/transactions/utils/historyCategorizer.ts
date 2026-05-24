import type { Transaction, TransactionType } from '~/types';

const HAS_CJK_PATTERN = /[㐀-鿿豈-﫿]/;
const LATIN_WORD_PATTERN = /[a-z0-9]+/g;
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'for',
  'with',
  'on',
  'at',
  'in',
  'my',
  'me',
  'i',
  'is',
  'was',
  'were',
  'be',
  'this',
  'that',
  'it',
  'from',
  'by',
]);

interface HistoryMatchOptions {
  type: TransactionType;
  maxLookback?: number;
}

interface HistoryMatchResult {
  categoryId: string;
  accountId: string | null;
  score: number;
  matchedNote: string;
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCjkPhrases(text: string): string[] {
  const phrases: string[] = [];
  let current = '';
  for (const ch of text) {
    if (HAS_CJK_PATTERN.test(ch)) {
      current += ch;
    } else if (current) {
      phrases.push(current);
      current = '';
    }
  }
  if (current) phrases.push(current);
  return phrases;
}

function extractLatinTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const matches = lower.match(LATIN_WORD_PATTERN) ?? [];
  return matches.filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function matchesLatinWord(text: string, token: string): boolean {
  if (!token) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(token)}(?:[^a-z0-9]|$)`, 'i');
  return pattern.test(text);
}

function needleScore(needle: string, candidateNote: string): number {
  if (!needle || !candidateNote) return 0;
  if (HAS_CJK_PATTERN.test(needle)) {
    return candidateNote.includes(needle) ? needle.length * 2 : 0;
  }
  return matchesLatinWord(candidateNote.toLowerCase(), needle) ? needle.length : 0;
}

export function categorizeFromHistory(
  note: string,
  transactions: Transaction[],
  options: HistoryMatchOptions,
): HistoryMatchResult | null {
  const trimmed = note.trim();
  if (!trimmed) return null;

  const needles = Array.from(
    new Set([...extractCjkPhrases(trimmed), ...extractLatinTokens(trimmed)]),
  );
  if (needles.length === 0) return null;

  const { type, maxLookback = 500 } = options;

  // transactions are expected to be sorted by date desc (most recent first), so
  // the first match at the highest score is also the most recent — ties keep the
  // earlier-seen (more recent) entry.
  let best: HistoryMatchResult | null = null;
  let scanned = 0;

  for (const txn of transactions) {
    if (scanned >= maxLookback) break;
    if (txn.type !== type) continue;
    if (!txn.categoryId) continue;
    if (!txn.note) continue;
    scanned += 1;

    let total = 0;
    for (const needle of needles) {
      total += needleScore(needle, txn.note);
    }
    if (total === 0) continue;

    if (!best || total > best.score) {
      best = {
        categoryId: txn.categoryId,
        accountId: txn.accountId ?? null,
        score: total,
        matchedNote: txn.note,
      };
    }
  }

  return best;
}
