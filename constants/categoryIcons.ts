import type { ImageSourcePropType } from 'react-native';

import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_METADATA,
  type CategoryIconGroup,
} from '~/constants/categoryIconGroups';

import { CATEGORY_ICON_SOURCES, GENERATED_CATEGORY_ICONS } from './categoryIcons.generated';

export { CATEGORY_ICON_GROUPS, type CategoryIconGroup };
export { CATEGORY_ICON_SOURCES };

export type CategoryIconName = keyof typeof CATEGORY_ICON_SOURCES;

/**
 * ## Stored icon value grammar
 *
 * One tagged string covers every icon a category, savings goal or budget
 * template can carry. It is what lives in `categories.icon`,
 * `accounts.goal_emoji`, `budget_templates.emoji` and
 * `monthly_budgets.template_emoji`:
 *
 * | value                              | meaning                                 |
 * | ---------------------------------- | --------------------------------------- |
 * | `''` / `null`                      | no icon                                 |
 * | `meal`                             | bundled hand-drawn PNG (bare id)        |
 * | `emoji:X`                          | a literal Unicode emoji the user picked |
 * | `custom:category-icons/<uuid>.png` | a user-uploaded image                   |
 *
 * Emoji are prefixed rather than stored bare because a bare glyph is exactly
 * what pre-migration rows hold, where it meant "look me up in
 * LEGACY_EMOJI_TO_ICON". Tagging makes "is this a legacy value?" decidable, so
 * `normalizeIconValue` (lib/db/normalizeIcons.ts) is a true fixpoint: an
 * unmapped legacy glyph becomes `emoji:X` once and stays there, instead of
 * being reconsidered on every restore or re-run. It also means classification
 * is an ASCII `startsWith` rather than a Unicode regex, which matters because
 * emoji are routinely multi-codepoint (a flag is a surrogate pair of regional
 * indicators, a ZWJ family runs five codepoints or more).
 *
 * `custom:` reuses the prefix account logos and item icons already use, so
 * `assetRelativePathFromRef` in services/userAssets.ts handles these refs
 * unchanged. No bundled id contains `:`, so the three namespaces are disjoint.
 */
export const EMOJI_VALUE_PREFIX = 'emoji:';
export const CUSTOM_ICON_PREFIX = 'custom:';

/** True when the value contains any non-ASCII character, i.e. it looks like a
 *  glyph rather than a kebab-case id. Written as a scan rather than a regex so
 *  the source carries no control-character escapes. */
function hasNonAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return true;
  }
  return false;
}

export type ClassifiedCategoryIcon =
  | { kind: 'none' }
  | { kind: 'bundled'; id: string; source: ImageSourcePropType }
  | { kind: 'custom'; ref: string }
  | { kind: 'emoji'; glyph: string };

const NONE: ClassifiedCategoryIcon = { kind: 'none' };

/**
 * Resolves a stored value to what should be drawn. Pure, and deliberately free
 * of native imports: services/widgetSnapshot.shared.ts and the node-env Jest
 * suites import this module, so it must not reach for expo-file-system. The
 * `custom` branch therefore returns the raw ref and leaves the filesystem hop
 * to the renderer (see components/ui/CategoryEmoji.tsx).
 */
export function classifyCategoryIcon(value?: string | null): ClassifiedCategoryIcon {
  const trimmed = value?.trim();
  if (!trimmed) return NONE;
  if (trimmed.startsWith(CUSTOM_ICON_PREFIX)) return { kind: 'custom', ref: trimmed };
  if (trimmed.startsWith(EMOJI_VALUE_PREFIX)) {
    const glyph = trimmed.slice(EMOJI_VALUE_PREFIX.length);
    return glyph ? { kind: 'emoji', glyph } : NONE;
  }
  const source = CATEGORY_ICON_SOURCES[trimmed];
  if (source) return { kind: 'bundled', id: trimmed, source };
  // Safety net for a legacy glyph that dodged normalization (an old backup
  // restored through a path we missed). Degrades to "shows an emoji", never to
  // "shows nothing", and needs no lookup table to do it.
  if (hasNonAscii(trimmed)) return { kind: 'emoji', glyph: trimmed };
  return NONE;
}

/**
 * Resolves a value to a bundled static image source, or null when it is not a
 * bundled icon. Callers that also need the emoji/custom cases should use
 * {@link classifyCategoryIcon} directly.
 */
export function resolveCategoryIconSource(value?: string | null): ImageSourcePropType | null {
  const classified = classifyCategoryIcon(value);
  return classified.kind === 'bundled' ? classified.source : null;
}

export interface CategoryIconMeta {
  id: string;
  name: string;
  group: CategoryIconGroup;
  /** Space-separated lowercase search terms (name and id included). */
  keywords: string;
}

/**
 * Every bundled icon with its section and search terms, joined from the
 * generated PNG list and the hand-maintained grouping in
 * constants/categoryIconGroups.ts. An icon with no metadata entry falls into
 * `other` so a newly dropped-in PNG is still selectable; a test fails so the
 * omission does not survive review.
 */
export const CATEGORY_ICONS: CategoryIconMeta[] = GENERATED_CATEGORY_ICONS.map(
  ({ id, fallbackName }) => {
    const meta = CATEGORY_ICON_METADATA[id];
    const name = meta?.name ?? fallbackName;
    const keywords = `${name} ${id.replace(/-/g, ' ')} ${meta?.keywords ?? ''}`.toLowerCase();
    return { id, name, group: meta?.group ?? 'other', keywords };
  },
);

const ICONS_BY_ID = new Map(CATEGORY_ICONS.map((icon) => [icon.id, icon]));

export function getCategoryIconMeta(id: string): CategoryIconMeta | null {
  return ICONS_BY_ID.get(id) ?? null;
}

/** Icons bucketed by section, in CATEGORY_ICON_GROUPS order. Empty sections are dropped. */
export const CATEGORY_ICONS_BY_GROUP: { group: CategoryIconGroup; icons: CategoryIconMeta[] }[] =
  CATEGORY_ICON_GROUPS.map((group) => ({
    group,
    icons: CATEGORY_ICONS.filter((icon) => icon.group === group),
  })).filter((section) => section.icons.length > 0);

/**
 * Substring/prefix search over icon names and keywords, ranked prefix >
 * word-boundary > substring, then alphabetically. Mirrors `searchItemIcons`
 * in constants/itemIcons.ts.
 */
export function searchCategoryIcons(query: string): CategoryIconMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATEGORY_ICONS;

  const scored: { icon: CategoryIconMeta; score: number }[] = [];
  for (const icon of CATEGORY_ICONS) {
    const name = icon.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q) || icon.id.startsWith(q)) {
      score = 3;
    } else if (icon.keywords.includes(` ${q}`)) {
      score = 2;
    } else if (icon.keywords.includes(q)) {
      score = 1;
    }
    if (score >= 0) scored.push({ icon, score });
  }

  scored.sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name));
  return scored.map((entry) => entry.icon);
}

/**
 * A representative emoji per bundled icon, for the surfaces that cannot render
 * a bundled PNG: the native home-screen widgets and the Siri Shortcuts catalog
 * (both render a plain string), plus the human-facing Excel export.
 *
 * Hand-authored for all 62 rather than derived by inverting
 * LEGACY_EMOJI_TO_ICON, which is many-to-one and covers only half the set.
 * A test asserts every key of CATEGORY_ICON_SOURCES appears here, so adding a
 * PNG cannot silently blank out a widget row.
 */
export const ICON_NAME_TO_EMOJI: Record<string, string> = {
  alcohol: '🍺',
  ballone: '🎉',
  balloon: '👶',
  bank: '🏦',
  beach: '🏖️',
  'bill-calendar': '📅',
  'boxing-gloves': '🥊',
  briefcase: '💼',
  bus: '🚌',
  camera: '📷',
  'camper-van': '🚐',
  car: '🚗',
  cash: '💰',
  cat: '🐱',
  'chess-knight': '♟️',
  clapperboard: '🎬',
  coffee: '☕',
  'coins-checkmark': '💰',
  'coins-euro': '💶',
  coins: '🪙',
  cosmetics: '💄',
  'credit-card': '💳',
  dog: '🐶',
  dress: '👗',
  dumbbell: '🏋️',
  faucet: '🚰',
  'game-controller': '🎮',
  'gas-pump': '⛽',
  gear: '⚙️',
  gift: '🎁',
  'globe-money': '💱',
  'globe-shield': '🛡️',
  'graduation-cap': '🎓',
  'grocery-basket': '🛒',
  headphone: '🎧',
  heart: '❤️',
  house: '🏠',
  invoice: '🧾',
  keys: '🔑',
  laptop: '💻',
  'light-bulb': '💡',
  meal: '🍔',
  medicine: '💊',
  mountain: '🏞️',
  'paw-print': '🐾',
  'piggy-bank': '🐷',
  plane: '✈️',
  'potted-plant': '🪴',
  'price-tag': '🏷️',
  'question-mark': '❓',
  'shopping-bag': '🛍️',
  sneaker: '👟',
  sofa: '🛋️',
  stethoscope: '🩺',
  't-shirt': '👕',
  target: '🎯',
  van: '🚚',
  wallet: '👛',
  warning: '⚠️',
  'work-bag': '🧳',
  wrench: '🔧',
  'yoga-mat': '🧘',
};

/**
 * Best-effort emoji for a stored icon value, for string-only surfaces. Returns
 * '' when nothing sensible exists, which every caller already renders as a
 * bullet. Uploaded images deliberately return '' rather than a wrong stand-in.
 */
export function categoryIconToEmoji(value?: string | null): string {
  const classified = classifyCategoryIcon(value);
  switch (classified.kind) {
    case 'emoji':
      return classified.glyph;
    case 'bundled':
      return ICON_NAME_TO_EMOJI[classified.id] ?? '';
    case 'custom':
    case 'none':
      return '';
  }
}
