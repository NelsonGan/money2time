/**
 * A shared album's categories (README: Album members and shared albums >
 * Categories): the app's eight default expense categories, under keys that
 * never change, the same for everyone in the album and on the website. Each
 * reads in the user's language; the user's own entry for a bill is filed
 * under their matching category (`personalCategoryFor`). Pure.
 */

import { findFallbackCategory } from '~/features/transactions/lib/entryDefaults';
import {
  type KeywordCategoryKey,
  matchKeywordBucket,
  resolveBucketCategoryIds,
} from '~/features/transactions/utils/categoryKeywords';
import type { Category } from '~/types';

import { albumCategoryIcon, albumCategoryLabel } from './albumCategoryName';
import {
  ALBUM_CATEGORIES,
  ALBUM_CATEGORY_OTHER,
  type AlbumCategoryKey,
  isAlbumCategoryKey,
} from './groupPlan';

export { type AlbumCategoryKey, isAlbumCategoryKey };

/** The quick-entry bucket → category overrides (`quickEntryPrefs.categoryMap`). */
export type CategoryMap = Partial<Record<string, string>>;
/** One empty map for callers with none, so the per-list cache below still hits. */
const NO_CATEGORY_MAP: CategoryMap = {};

const ID_PREFIX = 'album-category:';

/**
 * The id an album category goes by in the transaction editor's pickers, which
 * list categories: never a row of the categories table, and turned into the
 * user's own category before anything is saved (`personalCategoryFor`).
 */
export const albumCategoryId = (key: AlbumCategoryKey) => `${ID_PREFIX}${key}`;

export function albumCategoryKeyOfId(id: string | null | undefined): AlbumCategoryKey | null {
  if (!id?.startsWith(ID_PREFIX)) return null;
  const key = id.slice(ID_PREFIX.length);
  return isAlbumCategoryKey(key) ? key : null;
}

export { albumCategoryIcon, albumCategoryLabel };

/** The fixed list as categories, for the editor's pickers, in their own order. */
export function albumCategoryPickerList(): Category[] {
  return ALBUM_CATEGORIES.map((category, index) => ({
    id: albumCategoryId(category.key),
    name: albumCategoryLabel(category.key),
    sortOrder: index,
    type: 'expense',
    parentId: null,
    icon: category.icon,
    isDefault: true,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }));
}

const rootExpenseCategories = (categories: readonly Category[]) =>
  categories.filter(
    (category) => category.type === 'expense' && !category.parentId && !category.deletedAt,
  );

/**
 * Which of the user's categories stands for each album category: the one
 * Quick Entry files that bucket under (the user's own pick, else the name),
 * else the one with the category's default icon. Other is the user's Other.
 * One pass over the categories for all eight; cached per list.
 */
interface PersonalCategories {
  /** The user's category matching each album category, Other excluded. */
  matched: Map<AlbumCategoryKey, string>;
  /** The user's Other (or first expense category). */
  fallback: string | null;
}

const personalCache = new WeakMap<
  readonly Category[],
  { map: CategoryMap; personal: PersonalCategories }
>();

function personalCategories(
  categories: readonly Category[],
  categoryMap: CategoryMap,
): PersonalCategories {
  const cached = personalCache.get(categories);
  if (cached && cached.map === categoryMap) return cached.personal;
  const roots = rootExpenseCategories(categories);
  const buckets = resolveBucketCategoryIds(roots, categoryMap);
  const matched = new Map<AlbumCategoryKey, string>();
  for (const category of ALBUM_CATEGORIES) {
    if (category.key === ALBUM_CATEGORY_OTHER) continue;
    const id =
      buckets.get(category.key as KeywordCategoryKey) ??
      roots.find((root) => root.icon === category.icon)?.id ??
      null;
    if (id) matched.set(category.key, id);
  }
  const personal = { matched, fallback: findFallbackCategory(roots, 'expense')?.id ?? null };
  personalCache.set(categories, { map: categoryMap, personal });
  return personal;
}

/** The user's own category for a bill of an album category: their matching one, else Other. */
export function personalCategoryFor(
  key: AlbumCategoryKey,
  categories: readonly Category[],
  categoryMap: CategoryMap = NO_CATEGORY_MAP,
): string | null {
  const personal = personalCategories(categories, categoryMap);
  return personal.matched.get(key) ?? personal.fallback;
}

/**
 * The album category one of the user's own categories reads as: the one it
 * stands for, else (a subcategory) its parent's, else Other. For an entry of
 * the user's own in a shared album, which the group gave no category.
 */
export function albumCategoryForCategory(
  categoryId: string | null | undefined,
  categories: readonly Category[],
  categoryMap: CategoryMap = NO_CATEGORY_MAP,
): AlbumCategoryKey {
  if (!categoryId) return ALBUM_CATEGORY_OTHER;
  const category = categories.find((item) => item.id === categoryId);
  const rootId = category?.parentId ?? categoryId;
  for (const [key, id] of personalCategories(categories, categoryMap).matched) {
    if (id === rootId) return key;
  }
  return ALBUM_CATEGORY_OTHER;
}

/**
 * The album category a bill's title reads as ("Lunch" → `food`), by Quick
 * Entry's keywords; a title whose keywords are of another kind (a movie) is
 * Other, and one with none, null (keep what is picked).
 */
export function albumCategoryForText(text: string): AlbumCategoryKey | null {
  const bucket = matchKeywordBucket(text);
  if (!bucket) return null;
  return isAlbumCategoryKey(bucket) ? bucket : ALBUM_CATEGORY_OTHER;
}
