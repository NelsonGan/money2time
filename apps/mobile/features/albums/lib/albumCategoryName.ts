/**
 * An album category's name in the app's language and its icon: how a shared
 * album's entry shows its category in every list, in place of the user's own
 * (README: Album members and shared albums > Categories). Kept apart from
 * `albumCategories.ts` so the repositories' mappers can use it without the
 * keyword tables.
 */

import { I18n } from '~/lib/i18n';

import { ALBUM_CATEGORIES, type AlbumCategoryKey } from './groupPlan';

const categoryOf = (key: AlbumCategoryKey) =>
  ALBUM_CATEGORIES.find((entry) => entry.key === key) ??
  ALBUM_CATEGORIES[ALBUM_CATEGORIES.length - 1];

export const albumCategoryLabel = (key: AlbumCategoryKey): string =>
  I18n.t(`albums.categories.${key}`, { defaultValue: categoryOf(key).name });

export const albumCategoryIcon = (key: AlbumCategoryKey): string => categoryOf(key).icon;
