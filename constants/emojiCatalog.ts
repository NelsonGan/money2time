import { EMOJI_CATALOG, EMOJI_GROUPS, type EmojiMeta } from './emojiCatalog.generated';

export { EMOJI_CATALOG, EMOJI_GROUPS, type EmojiMeta };

const BY_GLYPH = new Set(EMOJI_CATALOG.map((entry) => entry.e));

/** Emoji bucketed by section, in EMOJI_GROUPS order. */
export const EMOJI_BY_GROUP: { group: string; emoji: EmojiMeta[] }[] = EMOJI_GROUPS.map(
  (group, index) => ({
    group,
    emoji: EMOJI_CATALOG.filter((entry) => entry.g === index),
  }),
).filter((section) => section.emoji.length > 0);

/**
 * Substring/prefix search over CLDR names and keywords, ranked name-prefix >
 * name word-boundary > keyword hit > name substring, then alphabetically.
 * Mirrors `searchItemIcons` in constants/itemIcons.ts.
 *
 * An exact glyph query returns that glyph first, so pasting an emoji finds it.
 */
export function searchEmoji(query: string): EmojiMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...EMOJI_CATALOG];

  const scored: { entry: EmojiMeta; score: number }[] = [];
  for (const entry of EMOJI_CATALOG) {
    let score = -1;
    if (BY_GLYPH.has(q) && entry.e === q) {
      score = 5;
    } else if (entry.n.startsWith(q)) {
      score = 4;
    } else if (entry.n.includes(` ${q}`)) {
      score = 3;
    } else if (entry.k && (entry.k.startsWith(q) || entry.k.includes(` ${q}`))) {
      score = 2;
    } else if (entry.n.includes(q)) {
      score = 1;
    }
    if (score >= 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.n.localeCompare(b.entry.n));
  return scored.map((item) => item.entry);
}
