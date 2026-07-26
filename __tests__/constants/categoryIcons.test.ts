import { CATEGORY_ICON_METADATA } from '~/constants/categoryIconGroups';
import {
  CATEGORY_ICON_SOURCES,
  CATEGORY_ICONS,
  categoryIconGroupLabelKey,
  categoryIconsByGroup,
  conceptOf,
  categoryIconToEmoji,
  classifyCategoryIcon,
  DEFAULT_ICON_PACK_ID,
  ICON_NAME_TO_EMOJI,
  ICON_PACKS,
  searchCategoryIcons,
} from '~/constants/categoryIcons';
import en from '~/lib/i18n/locales/en';

describe('classifyCategoryIcon', () => {
  it('classifies a bundled icon id', () => {
    const result = classifyCategoryIcon('meal');
    expect(result.kind).toBe('bundled');
    expect(result.kind === 'bundled' && result.id).toBe('meal');
  });

  it('classifies a tagged emoji and strips the prefix', () => {
    const result = classifyCategoryIcon('emoji:🎌');
    expect(result).toEqual({ kind: 'emoji', glyph: '🎌' });
  });

  it('classifies an uploaded image, keeping the raw ref', () => {
    const result = classifyCategoryIcon('custom:category-icons/a.png');
    expect(result).toEqual({ kind: 'custom', ref: 'custom:category-icons/a.png' });
  });

  it('treats empty, whitespace and null as no icon', () => {
    expect(classifyCategoryIcon('')).toEqual({ kind: 'none' });
    expect(classifyCategoryIcon('   ')).toEqual({ kind: 'none' });
    expect(classifyCategoryIcon(null)).toEqual({ kind: 'none' });
    expect(classifyCategoryIcon(undefined)).toEqual({ kind: 'none' });
    // A prefix with nothing after it is malformed, not an empty glyph.
    expect(classifyCategoryIcon('emoji:')).toEqual({ kind: 'none' });
  });

  it('falls back to rendering a stray legacy glyph as an emoji', () => {
    // The safety net for a value that dodged normalization: it degrades to
    // "shows an emoji", never to "shows nothing".
    expect(classifyCategoryIcon('🍔')).toEqual({ kind: 'emoji', glyph: '🍔' });
  });

  it('treats an unknown ASCII token as no icon', () => {
    expect(classifyCategoryIcon('not-a-real-icon')).toEqual({ kind: 'none' });
  });
});

describe('categoryIconToEmoji', () => {
  it('maps a bundled icon to its stand-in glyph', () => {
    expect(categoryIconToEmoji('meal')).toBe('🍔');
    expect(categoryIconToEmoji('car')).toBe('🚗');
  });

  it('passes a tagged emoji through', () => {
    expect(categoryIconToEmoji('emoji:🎌')).toBe('🎌');
  });

  it('returns empty for an uploaded image rather than a wrong stand-in', () => {
    expect(categoryIconToEmoji('custom:category-icons/a.png')).toBe('');
  });

  it('returns empty for no icon', () => {
    expect(categoryIconToEmoji(null)).toBe('');
    expect(categoryIconToEmoji('')).toBe('');
  });

  it('passes a legacy bare glyph through unchanged', () => {
    // Keeps pre-migration widget snapshots rendering exactly as before.
    expect(categoryIconToEmoji('🍜')).toBe('🍜');
  });
});

describe('icon registry invariants', () => {
  const ids = Object.keys(CATEGORY_ICON_SOURCES);
  const defaultConcepts = CATEGORY_ICONS.filter((icon) => icon.pack === DEFAULT_ICON_PACK_ID).map(
    (icon) => icon.concept,
  );

  const concepts = Array.from(new Set(CATEGORY_ICONS.map((icon) => icon.concept)));

  it('gives every icon concept a stand-in emoji', () => {
    // Without this, adding artwork silently blanks that category in the native
    // widgets and the Shortcuts picker, which render a string and nothing else.
    const missing = concepts.filter((concept) => !ICON_NAME_TO_EMOJI[concept]);
    expect(missing).toEqual([]);
  });

  it('has no stale entries in the stand-in map', () => {
    const known = new Set(concepts);
    const stale = Object.keys(ICON_NAME_TO_EMOJI).filter((concept) => !known.has(concept));
    expect(stale).toEqual([]);
  });

  it('qualifies non-default pack ids and leaves default ids bare', () => {
    // Rows written before packs existed store bare ids, so the default pack must
    // stay bare or every icon column would need migrating.
    for (const icon of CATEGORY_ICONS) {
      const expected =
        icon.pack === DEFAULT_ICON_PACK_ID ? icon.concept : `${icon.pack}/${icon.concept}`;
      expect(icon.id).toBe(expected);
      expect(conceptOf(icon.id)).toBe(icon.concept);
    }
  });

  it('only maps to real glyphs, never to ASCII', () => {
    for (const [id, glyph] of Object.entries(ICON_NAME_TO_EMOJI)) {
      expect(glyph.length).toBeGreaterThan(0);
      // An ASCII value here would render as literal text on the widget.
      expect(/^[\x00-\x7f]*$/.test(glyph)).toBe(false);
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('has no stale metadata entries', () => {
    const known = new Set(CATEGORY_ICONS.map((icon) => icon.concept));
    const stale = Object.keys(CATEGORY_ICON_METADATA).filter((concept) => !known.has(concept));
    expect(stale).toEqual([]);
  });

  it('ships at least the default pack, and every icon belongs to one', () => {
    const packIds = new Set(ICON_PACKS.map((pack) => pack.id));
    expect(packIds.has(DEFAULT_ICON_PACK_ID)).toBe(true);
    for (const icon of CATEGORY_ICONS) {
      expect(packIds.has(icon.pack)).toBe(true);
    }
  });

  it('places every default-pack icon in exactly one section', () => {
    const grouped = categoryIconsByGroup(DEFAULT_ICON_PACK_ID).flatMap((section) =>
      section.icons.map((icon) => icon.concept),
    );
    expect(grouped.sort()).toEqual([...defaultConcepts].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('gives every id a source, across every pack', () => {
    for (const icon of CATEGORY_ICONS) {
      expect(CATEGORY_ICON_SOURCES[icon.id]).toBeDefined();
    }
    expect(ids.length).toBe(CATEGORY_ICONS.length);
  });

  it('has an i18n label for every section folder', () => {
    // Section ids come from folder names, so a renamed or newly added folder
    // would otherwise ship its raw key as the header. Resolve through the same
    // helper the picker uses, so the two cannot drift on hyphen/underscore.
    const labels = en.category_icon as Record<string, string>;
    for (const pack of ICON_PACKS) {
      for (const section of categoryIconsByGroup(pack.id)) {
        const key = categoryIconGroupLabelKey(section.group).replace('category_icon.', '');
        expect(labels[key]).toBeDefined();
      }
    }
  });
});

describe('searchCategoryIcons', () => {
  it('returns everything for an empty query', () => {
    expect(searchCategoryIcons('')).toHaveLength(CATEGORY_ICONS.length);
    expect(searchCategoryIcons('   ')).toHaveLength(CATEGORY_ICONS.length);
  });

  it('finds an icon by its display name', () => {
    // Several packs ship a `meal`, so assert on the concept, not the id.
    expect(searchCategoryIcons('meal')[0].concept).toBe('meal');
    expect(searchCategoryIcons('meal', DEFAULT_ICON_PACK_ID)[0].id).toBe('meal');
  });

  it('scopes search to one pack when asked', () => {
    const scoped = searchCategoryIcons('', DEFAULT_ICON_PACK_ID);
    expect(scoped.every((icon) => icon.pack === DEFAULT_ICON_PACK_ID)).toBe(true);
    expect(scoped.length).toBeLessThan(CATEGORY_ICONS.length);
  });

  it('finds an icon by a keyword that is not in its name', () => {
    // The whole point of the keyword list: the artwork is a tap, the user
    // searches for what it is used for.
    expect(searchCategoryIcons('rent').map((i) => i.id)).toContain('house');
    expect(searchCategoryIcons('restaurant').map((i) => i.id)).toContain('meal');
    expect(searchCategoryIcons('petrol').map((i) => i.id)).toContain('gas-pump');
  });

  it('finds icons whose slug does not describe the artwork', () => {
    // `ballone` is a balloon with a party hat and `balloon` is the baby icon,
    // so both are reachable only through their curated names/keywords.
    expect(searchCategoryIcons('party').map((i) => i.id)).toContain('ballone');
    expect(searchCategoryIcons('baby').map((i) => i.id)).toContain('balloon');
    expect(searchCategoryIcons('luggage').map((i) => i.id)).toContain('work-bag');
  });

  it('returns nothing for a query that matches no icon', () => {
    expect(searchCategoryIcons('zzzzzzzz')).toEqual([]);
  });
});
