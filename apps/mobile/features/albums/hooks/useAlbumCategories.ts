import { useSyncExternalStore } from 'react';

import type { AlbumCategoryDef } from '../lib/albumCategories';
import { listGroupCategories, subscribeAlbumGroups } from '../services/albumGroupStore';

/**
 * A shared album's categories, in order (the defaults with no group), kept
 * up to date as its rows sync (README: Album members and shared albums >
 * Categories).
 */
export function useAlbumCategories(groupId: string | null): readonly AlbumCategoryDef[] {
  return useSyncExternalStore(subscribeAlbumGroups, () => listGroupCategories(groupId));
}
