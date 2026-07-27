import { classifyCategoryIcon, EMOJI_VALUE_PREFIX } from '~/constants/categoryIcons';
import { EMOJI_BY_GROUP, EMOJI_CATALOG, EMOJI_GROUPS, searchEmoji } from '~/constants/emojiCatalog';

describe('emoji catalog', () => {
  it('is populated', () => {
    expect(EMOJI_CATALOG.length).toBeGreaterThan(1000);
  });

  it('places every entry in a real group', () => {
    for (const entry of EMOJI_CATALOG) {
      expect(EMOJI_GROUPS[entry.g]).toBeDefined();
    }
  });

  it('contains no duplicate glyphs', () => {
    const glyphs = EMOJI_CATALOG.map((entry) => entry.e);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('excludes skin-tone variants', () => {
    // The generator drops them; they would multiply the catalog ~6x for no
    // picker value.
    const hasSkinTone = EMOJI_CATALOG.some((entry) =>
      Array.from(entry.e).some((char) => {
        const cp = char.codePointAt(0) ?? 0;
        return cp >= 0x1f3fb && cp <= 0x1f3ff;
      }),
    );
    expect(hasSkinTone).toBe(false);
  });

  it('gives every entry a non-empty lowercase name', () => {
    for (const entry of EMOJI_CATALOG) {
      expect(entry.n.length).toBeGreaterThan(0);
      expect(entry.n).toBe(entry.n.toLowerCase());
    }
  });

  it('round-trips every glyph through the stored value grammar', () => {
    // Catches a generator that mangles ZWJ sequences or drops a variation
    // selector: the glyph a user picks must be the glyph that comes back out.
    for (const entry of EMOJI_CATALOG) {
      const stored = `${EMOJI_VALUE_PREFIX}${entry.e}`;
      const classified = classifyCategoryIcon(stored);
      expect(classified).toEqual({ kind: 'emoji', glyph: entry.e });
    }
  });

  it('buckets every entry into exactly one section', () => {
    const total = EMOJI_BY_GROUP.reduce((sum, section) => sum + section.emoji.length, 0);
    expect(total).toBe(EMOJI_CATALOG.length);
  });
});

describe('searchEmoji', () => {
  it('returns everything for an empty query', () => {
    expect(searchEmoji('')).toHaveLength(EMOJI_CATALOG.length);
  });

  it('finds an emoji by its name', () => {
    expect(searchEmoji('hamburger')[0].e).toBe('🍔');
  });

  it('finds an emoji by a CLDR keyword outside its name', () => {
    expect(searchEmoji('burger').map((entry) => entry.e)).toContain('🍔');
  });

  it('finds a pasted glyph', () => {
    expect(searchEmoji('🍔')[0].e).toBe('🍔');
  });

  it('returns nothing for a query that matches no emoji', () => {
    expect(searchEmoji('zzzzzzzz')).toEqual([]);
  });
});
