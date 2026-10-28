/**
 * Note suggestions match a past note when what the user typed starts the note
 * or starts any word in it, so "burger" finds "Mcd Burger" as well as
 * "Burger King". Notes that start with the text rank first, the way they did
 * when only the start of a note matched; each group keeps its recency order.
 *
 * Scripts written without spaces (Chinese, Japanese, Thai) have no words to
 * start, so there the text may sit anywhere in the note.
 */

const NO_SPACE_SCRIPT = /[฀-๿぀-ヿ㐀-䶿一-鿿豈-﫿]/;

// A letter has a case pair or belongs to a caseless script; digits count too.
// Anything else (spaces, punctuation, symbols) separates words.
function isWordChar(ch: string): boolean {
  if (/[0-9]/.test(ch)) return true;
  if (ch.toLowerCase() !== ch.toUpperCase()) return true;
  return NO_SPACE_SCRIPT.test(ch) || /[가-힯]/.test(ch);
}

/** 0 = the note starts with the query, 1 = a word does, null = no match. */
export function noteMatchRank(note: string, query: string): 0 | 1 | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const n = note.toLowerCase();
  if (n.startsWith(q)) return 0;
  const anywhere = NO_SPACE_SCRIPT.test(q.charAt(0));
  let at = n.indexOf(q, 1);
  while (at !== -1) {
    if (anywhere || !isWordChar(n.charAt(at - 1))) return 1;
    at = n.indexOf(q, at + 1);
  }
  return null;
}

/** Filters notes (newest first) to the matches, start-of-note matches first. */
export function rankNoteSuggestions(
  notesNewestFirst: string[],
  query: string,
  limit = 5,
): string[] {
  const starts: string[] = [];
  const words: string[] = [];
  for (const note of notesNewestFirst) {
    const rank = noteMatchRank(note, query);
    if (rank === 0) starts.push(note);
    else if (rank === 1) words.push(note);
  }
  return [...starts, ...words].slice(0, limit);
}

/** Escapes LIKE wildcards so a typed "%" or "_" is matched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
