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
