import type { ImageSourcePropType } from 'react-native';

import {
  ITEM_ICON_GROUP_ORDER,
  ITEM_ICON_SOURCES,
  ITEM_ICONS,
  type ItemIconGroup,
  type ItemIconMeta,
} from './itemIcons.generated';

export { ITEM_ICON_GROUP_ORDER, ITEM_ICONS, type ItemIconGroup, type ItemIconMeta };

export function itemIconsByGroup(): { group: ItemIconGroup; icons: ItemIconMeta[] }[] {
  return ITEM_ICON_GROUP_ORDER.map((group) => ({
    group,
    icons: ITEM_ICONS.filter((icon) => icon.group === group),
  })).filter((section) => section.icons.length > 0);
}

export function itemIconGroupLabelKey(group: ItemIconGroup): string {
  return `category_icon.group_${group}`;
}

export function resolveItemIconSource(iconId?: string | null): ImageSourcePropType | null {
  if (!iconId) return null;
  return ITEM_ICON_SOURCES[iconId] ?? null;
}

/**
 * Substring/prefix search across the bundled item-icon library. Matches the
 * icon name and id, ranked prefix > word-boundary > substring, then
 * alphabetically.
 */
export function searchItemIcons(query: string): ItemIconMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return ITEM_ICONS;

  const scored: { icon: ItemIconMeta; score: number }[] = [];
  for (const icon of ITEM_ICONS) {
    const name = icon.name.toLowerCase();
    const id = icon.id.toLowerCase();
    let score = -1;
    if (name.startsWith(q) || id.startsWith(q)) {
      score = 3;
    } else if (name.includes(` ${q}`) || id.includes(`-${q}`)) {
      score = 2;
    } else if (name.includes(q) || id.includes(q)) {
      score = 1;
    }
    if (score >= 0) scored.push({ icon, score });
  }

  scored.sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name));
  return scored.map((entry) => entry.icon);
}
