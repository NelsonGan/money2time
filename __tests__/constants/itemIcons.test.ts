import {
  ITEM_ICON_GROUP_ORDER,
  ITEM_ICONS,
  itemIconsByGroup,
  searchItemIcons,
} from '~/constants/itemIcons';

describe('item icon catalog', () => {
  it('registers all 511 bundled icons once and assigns every icon to a group', () => {
    expect(ITEM_ICONS).toHaveLength(511);
    expect(new Set(ITEM_ICONS.map((icon) => icon.id)).size).toBe(ITEM_ICONS.length);
    expect(ITEM_ICONS.every((icon) => ITEM_ICON_GROUP_ORDER.includes(icon.group))).toBe(true);
  });

  it('returns every icon exactly once in stable group order', () => {
    const sections = itemIconsByGroup();
    expect(sections.map((section) => section.group)).toEqual(ITEM_ICON_GROUP_ORDER);
    expect(sections.every((section) => section.icons.length > 0)).toBe(true);
    expect(sections.flatMap((section) => section.icons.map((icon) => icon.id))).toHaveLength(511);
    expect(new Set(sections.flatMap((section) => section.icons.map((icon) => icon.id))).size).toBe(
      511,
    );
  });

  it('keeps ranked search independent of grouping', () => {
    const results = searchItemIcons('camera');
    expect(results[0]?.id).toBe('camera-bag');
    expect(results.some((icon) => icon.id === 'security-camera')).toBe(true);
    expect(results.every((icon) => ITEM_ICON_GROUP_ORDER.includes(icon.group))).toBe(true);
  });
});
