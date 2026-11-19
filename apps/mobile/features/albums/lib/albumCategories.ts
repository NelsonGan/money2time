/**
 * A shared album's categories (README: Album members and shared albums >
 * Categories): the app's eight default expense categories under keys that
 * never change, as the album changed them, and the ones it added, the same
 * for everyone in the album and on the website. A default reads in the
 * user's language until the album renames it; the user's own entry for a
 * bill is filed under their matching category (`personalCategoryFor`). Pure.
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
  type AlbumCategoryDef,
  type AlbumCategoryKey,
  albumCategoryList,
  isAlbumCategoryKey,
  isDefaultAlbumCategoryKey,
} from './groupPlan';

export { type AlbumCategoryDef, type AlbumCategoryKey, isAlbumCategoryKey };

/** The eight defaults as every album starts with them. */
export const DEFAULT_ALBUM_CATEGORY_LIST: readonly AlbumCategoryDef[] = albumCategoryList([]);

/** The album's category with this key, else (one it no longer has) its Other. */
export function albumCategoryIn(
  categories: readonly AlbumCategoryDef[],
  key: AlbumCategoryKey | null | undefined,
): AlbumCategoryDef {
  return (
    categories.find((category) => category.key === key) ??
    categories.find((category) => category.key === ALBUM_CATEGORY_OTHER) ??
    DEFAULT_ALBUM_CATEGORY_LIST[DEFAULT_ALBUM_CATEGORY_LIST.length - 1]
  );
}

/**
 * The categories an entry of an album no longer shared reads against: the
 * defaults, with the one it keeps (an added or changed one, by the name and
 * icon the entry kept) in its place.
 */
export function keptAlbumCategoryList(entry: {
  albumCategory?: AlbumCategoryKey | null;
  albumCategoryName?: string | null;
  albumCategoryIcon?: string | null;
}): readonly AlbumCategoryDef[] {
  const key = entry.albumCategory;
  if (!key || (!entry.albumCategoryName && !entry.albumCategoryIcon)) {
    return DEFAULT_ALBUM_CATEGORY_LIST;
  }
  const own: AlbumCategoryDef = {
    key,
    name: entry.albumCategoryName ?? null,
    icon: entry.albumCategoryIcon ?? null,
    sortOrder:
      DEFAULT_ALBUM_CATEGORY_LIST.find((category) => category.key === key)?.sortOrder ?? 999,
  };
  return [...DEFAULT_ALBUM_CATEGORY_LIST.filter((category) => category.key !== key), own].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Whether the album gave a category its own name or icon, or added it. */
export function isChangedAlbumCategory(category: AlbumCategoryDef): boolean {
  return category.name != null || category.icon != null || !isDefaultAlbumCategoryKey(category.key);
}

/** A category's name as it shows: the album's, else a default's in the user's language. */
export function albumCategoryNameOf(category: AlbumCategoryDef): string {
  return category.name ?? albumCategoryLabel(category.key);
}

/** A category's icon as it shows: the album's, else a default's. */
export function albumCategoryIconOf(category: AlbumCategoryDef): string {
  return category.icon ?? albumCategoryIcon(category.key);
}

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

/** The album's categories as categories, for the editor's pickers, in their own order. */
export function albumCategoryPickerList(
  categories: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST,
): Category[] {
  return categories.map((category, index) => ({
    id: albumCategoryId(category.key),
    name: albumCategoryNameOf(category),
    sortOrder: index,
    type: 'expense',
    parentId: null,
    icon: albumCategoryIconOf(category),
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
 * Which of the user's categories stands for each of an album's categories.
 * A default as it is: the one Quick Entry files that bucket under (the
 * user's own pick, else the name), else the one with the default's icon. One
 * the album renamed, gave another icon or added: the user's category of that
 * name, else of that icon. Other, and one with no match, is the user's Other.
 * Cached per list of the user's categories and the album's list.
 */
interface PersonalCategories {
  /** The user's category matching each album category, Other excluded. */
  matched: Map<AlbumCategoryKey, string>;
  /** The user's Other (or first expense category). */
  fallback: string | null;
}

const personalCache = new WeakMap<
  readonly Category[],
  WeakMap<readonly AlbumCategoryDef[], { map: CategoryMap; personal: PersonalCategories }>
>();

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

function personalCategories(
  categories: readonly Category[],
  categoryMap: CategoryMap,
  album: readonly AlbumCategoryDef[],
): PersonalCategories {
  let byAlbum = personalCache.get(categories);
  const cached = byAlbum?.get(album);
  if (cached && cached.map === categoryMap) return cached.personal;
  const roots = rootExpenseCategories(categories);
  const buckets = resolveBucketCategoryIds(roots, categoryMap);
  const matched = new Map<AlbumCategoryKey, string>();
  for (const category of album) {
    if (category.key === ALBUM_CATEGORY_OTHER) continue;
    let id: string | null;
    if (!isChangedAlbumCategory(category)) {
      const fixed = ALBUM_CATEGORIES.find((entry) => entry.key === category.key);
      id =
        buckets.get(category.key as KeywordCategoryKey) ??
        roots.find((root) => root.icon === fixed?.icon)?.id ??
        null;
    } else {
      const name = nameKey(albumCategoryNameOf(category));
      const icon = albumCategoryIconOf(category);
      id =
        roots.find((root) => nameKey(root.name) === name)?.id ??
        roots.find((root) => root.icon === icon)?.id ??
        null;
    }
    if (id) matched.set(category.key, id);
  }
  const personal = { matched, fallback: findFallbackCategory(roots, 'expense')?.id ?? null };
  if (!byAlbum) {
    byAlbum = new WeakMap();
    personalCache.set(categories, byAlbum);
  }
  byAlbum.set(album, { map: categoryMap, personal });
  return personal;
}

/**
 * The user's own category for a bill of an album category: their matching
 * one, else Other. `album`: the album's categories (the defaults without).
 */
export function personalCategoryFor(
  key: AlbumCategoryKey,
  categories: readonly Category[],
  categoryMap: CategoryMap = NO_CATEGORY_MAP,
  album: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST,
): string | null {
  const personal = personalCategories(categories, categoryMap, album);
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
  album: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST,
): AlbumCategoryKey {
  if (!categoryId) return ALBUM_CATEGORY_OTHER;
  const category = categories.find((item) => item.id === categoryId);
  const rootId = category?.parentId ?? categoryId;
  for (const [key, id] of personalCategories(categories, categoryMap, album).matched) {
    if (id === rootId) return key;
  }
  return ALBUM_CATEGORY_OTHER;
}

/**
 * The album category a bill's title reads as ("Lunch" → `food`), by Quick
 * Entry's keywords; a title whose keywords are of another kind (a movie) is
 * Other, and one with none, null (keep what is picked). A default the album
 * renamed, gave another icon or removed is never picked this way: its name
 * no longer says what the keywords mean.
 */
export function albumCategoryForText(
  text: string,
  album: readonly AlbumCategoryDef[] = DEFAULT_ALBUM_CATEGORY_LIST,
): AlbumCategoryKey | null {
  const bucket = matchKeywordBucket(text);
  if (!bucket) return null;
  if (!isDefaultAlbumCategoryKey(bucket)) return ALBUM_CATEGORY_OTHER;
  const category = album.find((entry) => entry.key === bucket);
  return category && !isChangedAlbumCategory(category) ? bucket : null;
}

/**
 * What the user's own entry keeps of its album category beside the key: an
 * added or changed one's name and icon (null where a default's own stands).
 */
export function albumCategoryLook(category: AlbumCategoryDef): {
  name: string | null;
  icon: string | null;
} {
  if (!isDefaultAlbumCategoryKey(category.key)) {
    return { name: albumCategoryNameOf(category), icon: albumCategoryIconOf(category) };
  }
  return { name: category.name, icon: category.icon };
}
