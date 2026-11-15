/**
 * A shared album's categories, as the app has them (its
 * `features/albums/lib/groupPlan.ts` `ALBUM_CATEGORIES` and
 * `albumCategories.ts`): the app's eight default expense categories under keys
 * that never change, the same for everyone in the album. A bill keeps its key
 * and that category's English name and icon, which older apps match against
 * their own categories. Its title picks one by the app's Quick Entry keywords
 * (`keywords/*.json`, copied from the app by its `sync:category-keywords`).
 * Pure, so the tests read it.
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

export type AlbumCategoryKey = (typeof ALBUM_CATEGORIES)[number]["key"];

export function isAlbumCategoryKey(value: unknown): value is AlbumCategoryKey {
  return ALBUM_CATEGORIES.some((category) => category.key === value);
}

export function albumCategory(key: AlbumCategoryKey) {
  return ALBUM_CATEGORIES.find((category) => category.key === key) ?? ALBUM_CATEGORIES[7];
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

/** Keyword lists by album category, as `keywords/*.json` hold them. */
export type KeywordTable = Partial<Record<AlbumCategoryKey, string[]>>;

const CJK = /[㐀-鿿豈-﫿]/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Compiled = { key: AlbumCategoryKey; length: number; test: (text: string, lower: string) => boolean };

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
 * Other, and one with none, null (keep what is picked). As the app's
 * `albumCategoryForText`.
 */
export function albumCategoryForText(text: string, keywords: readonly Compiled[]): AlbumCategoryKey | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const keyword of keywords) if (keyword.test(trimmed, lower)) return keyword.key;
  return null;
}
