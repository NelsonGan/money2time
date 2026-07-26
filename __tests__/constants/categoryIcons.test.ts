import {
  CATEGORY_ICON_SOURCES,
  CATEGORY_ICONS,
  CATEGORY_ICONS_BY_GROUP,
  categoryIconToEmoji,
  classifyCategoryIcon,
  ICON_NAME_TO_EMOJI,
  searchCategoryIcons,
} from '~/constants/categoryIcons';
import { CATEGORY_ICON_METADATA } from '~/constants/categoryIconGroups';

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

  it('gives every bundled icon a stand-in emoji', () => {
    // Without this, adding a PNG silently blanks that category in the native
    // widgets and the Shortcuts picker, which render a string and nothing else.
    const missing = ids.filter((id) => !ICON_NAME_TO_EMOJI[id]);
    expect(missing).toEqual([]);
  });

  it('has no stale entries in the stand-in map', () => {
    const stale = Object.keys(ICON_NAME_TO_EMOJI).filter((id) => !CATEGORY_ICON_SOURCES[id]);
    expect(stale).toEqual([]);
  });

  it('only maps to real glyphs, never to ASCII', () => {
    for (const [id, glyph] of Object.entries(ICON_NAME_TO_EMOJI)) {
      expect(glyph.length).toBeGreaterThan(0);
      // An ASCII value here would render as literal text on the widget.
      expect(/^[\x00-\x7f]*$/.test(glyph)).toBe(false);
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('assigns every bundled icon a hand-checked section', () => {
    // Falling back to `other` keeps a new PNG usable, but the grouping should
    // be a deliberate decision, so the omission has to fail here.
    const missing = ids.filter((id) => !CATEGORY_ICON_METADATA[id]);
    expect(missing).toEqual([]);
  });

  it('has no stale grouping entries', () => {
    const stale = Object.keys(CATEGORY_ICON_METADATA).filter((id) => !CATEGORY_ICON_SOURCES[id]);
    expect(stale).toEqual([]);
  });

  it('places every icon in exactly one section', () => {
    const grouped = CATEGORY_ICONS_BY_GROUP.flatMap((section) => section.icons.map((i) => i.id));
    expect(grouped.sort()).toEqual([...ids].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});

describe('searchCategoryIcons', () => {
  it('returns everything for an empty query', () => {
    expect(searchCategoryIcons('')).toHaveLength(CATEGORY_ICONS.length);
    expect(searchCategoryIcons('   ')).toHaveLength(CATEGORY_ICONS.length);
  });

  it('finds an icon by its display name', () => {
    expect(searchCategoryIcons('meal')[0].id).toBe('meal');
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
