import { useMemo, useSyncExternalStore } from 'react';

import { useSharedAlbum } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import type { TransactionWithRelations } from '~/types';

import { groupEntryCategories } from '../lib/albumBreakdown';
import type { AlbumCategoryKey } from '../lib/albumCategories';
import { listGroupExpenses, subscribeAlbumGroups } from '../services/albumGroupStore';

/**
 * A shared album's category of each of the user's entries in it, kept current
 * as its group changes; null for an album that is not shared (any more), whose
 * breakdown is by the user's own categories.
 */
export function useAlbumGroupCategories(
  albumId: string | null | undefined,
  entries: readonly TransactionWithRelations[],
): ReadonlyMap<string, AlbumCategoryKey> | null {
  const share = useSharedAlbum(albumId ?? undefined);
  const groupId = share?.ledgerId ?? null;
  const bills = useSyncExternalStore(subscribeAlbumGroups, () => listGroupExpenses(groupId));
  return useMemo(
    () => (groupId ? groupEntryCategories(bills, entries) : null),
    [bills, entries, groupId],
  );
}
