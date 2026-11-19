/**
 * A shared album's categories, as the app has them (its
 * `features/albums/lib/groupPlan.ts` `ALBUM_CATEGORIES`, `albumCategoryList`
 * and `albumCategories.ts`): the app's eight default expense categories under
 * keys that never change, as the album changed them (a new name or icon, its
 * place, removed), and the ones it added (`c-<id>`), the same for everyone in
 * the album. A bill keeps its key and that category's English name and icon
 * (an added one's own), which older apps match against their own categories.
 * Its title picks one by the app's Quick Entry keywords (`keywords/*.json`,
 * copied from the app by its `sync:category-keywords`), only ever an unchanged
 * default. Pure, so the tests read it.
 */

export const ALBUM_CATEGORIES = [
  { key: "food", name: "Food", icon: "meal" },
  { key: "groceries", name: "Groceries", icon: "grocery-basket" },
  { key: "transport", name: "Transport", icon: "car" },
  { key: "housing", name: "Housing", icon: "house" },
  { key: "bills", name: "Bills", icon: "light-bulb" },
  { key: "healthcare", name: "Healthcare", icon: "medicine" },
  { key: "shopping", name: "Shopping", icon: "shopping-bag" },
  { key: "other", name: "Other", icon: "invoice" },
] as const;

export type DefaultAlbumCategoryKey = (typeof ALBUM_CATEGORIES)[number]["key"];
/** A default category's key, or one an album added (`c-<id>`). */
export type AlbumCategoryKey = string;
const OTHER: DefaultAlbumCategoryKey = "other";
/** The key of a category an album added: `c-` and a random id. */
export const CUSTOM_ALBUM_CATEGORY_KEY = /^c-[A-Za-z0-9]{6,32}$/;
/** More categories than an album needs (the app offers at most 30). */
export const MAX_ALBUM_CATEGORIES = 30;
const MAX_CATEGORY_NAME = 40;
/** A category's icon every phone can draw: a bundled icon's id, or an emoji (`emoji:X`); never an uploaded image. */
export const ALBUM_CATEGORY_ICON = /^(?:[a-z0-9][a-z0-9-]{0,47}|emoji:[^\s/\\]{1,24})$/u;

export function isDefaultAlbumCategoryKey(value: unknown): value is DefaultAlbumCategoryKey {
  return ALBUM_CATEGORIES.some((category) => category.key === value);
}

/** A default category's key, or one an album added. */
export function isAlbumCategoryKey(value: unknown): value is AlbumCategoryKey {
  return isDefaultAlbumCategoryKey(value) || (typeof value === "string" && CUSTOM_ALBUM_CATEGORY_KEY.test(value));
}

/** A default category (Other for any other key). */
export function albumCategory(key: AlbumCategoryKey) {
  return ALBUM_CATEGORIES.find((category) => category.key === key) ?? ALBUM_CATEGORIES[7];
}

/** One of an album's categories, as its row (or a default with none) says. */
export type AlbumCategoryDef = {
  key: AlbumCategoryKey;
  /** The name the album gave it; null for a default's own (shown in the page's language). */
  name: string | null;
  /** The icon the album gave it; null for a default's own. */
  icon: string | null;
  sortOrder: number;
};

/** A category's name as every writer keeps it: one line, trimmed, at most 40 characters; null for none. */
export const cleanCategoryName = (value: unknown): string | null =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_CATEGORY_NAME) || null : null;

/** A category's row id in the group: one per album and key (the app's `categoryRowId`). */
export function categoryRowId(groupId: string, key: AlbumCategoryKey): string {
  const album = groupId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return `ac-${album}-${key}`.slice(0, 64);
}

type CategoryRow = { key?: unknown; name?: unknown; icon?: unknown; sort_order?: unknown; deleted_at?: unknown };

/**
 * An album's categories, in order: the eight defaults as the album changed
 * them, and the ones it added. Other is always there, whatever a row says.
 * As the app's `albumCategoryList`.
 */
export function albumCategoryList(rows: readonly CategoryRow[]): AlbumCategoryDef[] {
  const byKey = new Map<string, CategoryRow>();
  for (const row of rows) if (row && isAlbumCategoryKey(row.key)) byKey.set(row.key, row);
  const defs: AlbumCategoryDef[] = [];
  const add = (key: AlbumCategoryKey, index: number, isDefault: boolean) => {
    const row = byKey.get(key);
    if (row && row.deleted_at != null && key !== OTHER) return;
    if (!row && !isDefault) return;
    const name = cleanCategoryName(row?.name);
    if (!isDefault && !name) return;
    const icon = row?.icon;
    const order = row?.sort_order;
    defs.push({
      key,
      name,
      icon: typeof icon === "string" && ALBUM_CATEGORY_ICON.test(icon) ? icon : null,
      sortOrder: typeof order === "number" && Number.isFinite(order) ? order : isDefault ? index : 1000,
    });
  };
  ALBUM_CATEGORIES.forEach((category, index) => add(category.key, index, true));
  for (const key of byKey.keys()) if (!isDefaultAlbumCategoryKey(key)) add(key, ALBUM_CATEGORIES.length, false);
  return defs.slice(0, MAX_ALBUM_CATEGORIES + ALBUM_CATEGORIES.length).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

/** The eight defaults, as every album starts with them (and an older phone's album reads). */
export const DEFAULT_ALBUM_CATEGORY_LIST: readonly AlbumCategoryDef[] = albumCategoryList([]);

/** The album's category with this key, else (one it no longer has) its Other. */
export function albumCategoryIn(categories: readonly AlbumCategoryDef[], key: AlbumCategoryKey | null | undefined): AlbumCategoryDef {
  return categories.find((category) => category.key === key) ?? categories.find((category) => category.key === OTHER) ?? DEFAULT_ALBUM_CATEGORY_LIST[DEFAULT_ALBUM_CATEGORY_LIST.length - 1];
}

/** Whether the album gave a category its own name or icon, or added it. */
export function isChangedAlbumCategory(category: AlbumCategoryDef): boolean {
  return category.name != null || category.icon != null || !isDefaultAlbumCategoryKey(category.key);
}

/** A category's icon as it shows: the album's, else a default's. */
export function albumCategoryIconOf(category: AlbumCategoryDef): string {
  return category.icon ?? albumCategory(category.key).icon;
}

/**
 * The columns a bill is written with: a default's key, English name and
 * icon, or an added one's key, name and icon (the app's `albumCategoryColumns`).
 */
export function albumCategoryColumns(key: AlbumCategoryKey, categories: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST) {
  const added = isDefaultAlbumCategoryKey(key) ? null : categories.find((category) => category.key === key);
  if (!added) {
    const fixed = albumCategory(key);
    return { category_key: fixed.key as string, category_name: fixed.name as string, category_icon: fixed.icon as string };
  }
  return { category_key: added.key, category_name: added.name ?? "Other", category_icon: added.icon ?? "invoice" };
}

/**
 * A bill's category: its key, else (a row an older app wrote) the category
 * with its icon, then its English name, else Other. As the app's `albumCategoryOf`.
 */
export function albumCategoryOf(row: { category_key?: unknown; category_name?: unknown; category_icon?: unknown }): AlbumCategoryKey {
  if (isAlbumCategoryKey(row.category_key)) return row.category_key;
  const byIcon = ALBUM_CATEGORIES.find((category) => category.icon === row.category_icon);
  if (byIcon) return byIcon.key;
  const name = typeof row.category_name === "string" ? row.category_name.trim().toLowerCase() : "";
  return ALBUM_CATEGORIES.find((category) => category.name.toLowerCase() === name)?.key ?? "other";
}

/**
 * The album category one of the user's own categories reads as (an entry of
 * theirs in a shared album, which the group gave no category): one the album
 * renamed, gave another icon or added, by its name then its icon; else a
 * default it has as it is, by `albumCategoryOf`; else Other. As the app's
 * `albumCategoryForCategory`, as far as the page knows the user's categories.
 */
export function albumCategoryForOwn(own: { name?: string | null; icon?: string | null } | null | undefined, categories: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST): AlbumCategoryKey {
  if (!own) return OTHER;
  const name = own.name?.trim().toLocaleLowerCase() ?? "";
  const changed = categories.filter((category) => category.key !== OTHER && isChangedAlbumCategory(category));
  const byName = name ? changed.find((category) => (category.name ?? albumCategory(category.key).name).trim().toLocaleLowerCase() === name) : undefined;
  if (byName) return byName.key;
  const byIcon = own.icon ? changed.find((category) => albumCategoryIconOf(category) === own.icon) : undefined;
  if (byIcon) return byIcon.key;
  const key = albumCategoryOf({ category_name: own.name, category_icon: own.icon });
  const fixed = categories.find((category) => category.key === key);
  return fixed && !isChangedAlbumCategory(fixed) ? key : OTHER;
}

/** Keyword lists by album category, as `keywords/*.json` hold them. */
export type KeywordTable = Partial<Record<DefaultAlbumCategoryKey, string[]>>;

const CJK = /[㐀-鿿豈-﫿]/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Compiled = { key: DefaultAlbumCategoryKey; length: number; test: (text: string, lower: string) => boolean };

/** The keywords of one language, compiled once: longest first. */
export function compileKeywords(tables: readonly KeywordTable[]): Compiled[] {
  const compiled: Compiled[] = [];
  for (const category of ALBUM_CATEGORIES) {
    const seen = new Set<string>();
    for (const table of tables) {
      for (const keyword of table[category.key] ?? []) {
        if (!keyword || seen.has(keyword)) continue;
        seen.add(keyword);
        if (CJK.test(keyword)) {
          compiled.push({ key: category.key, length: keyword.length, test: (text) => text.includes(keyword) });
        } else {
          const pattern = new RegExp(`(?:^|[^a-z0-9])${escape(keyword.toLowerCase())}(?:[^a-z0-9]|$)`, "i");
          compiled.push({ key: category.key, length: keyword.length, test: (_, lower) => pattern.test(lower) });
        }
      }
    }
  }
  // Longest first; a tie goes to the category first in the list, as in the app.
  return compiled.sort((a, b) => b.length - a.length);
}

/**
 * The album category a bill's title reads as ("Lunch" → `food`), the longest
 * keyword winning; a title whose keywords are of another kind (a movie) is
 * Other, and one with none, null (keep what is picked). A default the album
 * renamed, gave another icon or removed is never picked this way: its name no
 * longer says what the keywords mean. As the app's `albumCategoryForText`.
 */
export function albumCategoryForText(text: string, keywords: readonly Compiled[], categories: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST): AlbumCategoryKey | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const keyword of keywords) {
    if (!keyword.test(trimmed, lower)) continue;
    if (keyword.key === OTHER) return OTHER;
    const category = categories.find((entry) => entry.key === keyword.key);
    return category && !isChangedAlbumCategory(category) ? keyword.key : null;
  }
  return null;
}
