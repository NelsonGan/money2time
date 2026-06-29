import type { ImageSourcePropType } from 'react-native';

import { ITEM_ICON_SOURCES, ITEM_ICONS, type ItemIconMeta } from './itemIcons.generated';

export { ITEM_ICONS, type ItemIconMeta };

const ICON_BY_ID = new Map<string, ItemIconMeta>(ITEM_ICONS.map((icon) => [icon.id, icon]));

/** Default glyph used when an item has no icon assigned yet. */
export const DEFAULT_ITEM_ICON_ID = ITEM_ICONS[0]?.id ?? null;

export function resolveItemIconSource(iconId?: string | null): ImageSourcePropType | null {
  if (!iconId) return null;
  return ITEM_ICON_SOURCES[iconId] ?? null;
}

export function getItemIconMeta(iconId?: string | null): ItemIconMeta | null {
  if (!iconId) return null;
  return ICON_BY_ID.get(iconId) ?? null;
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
