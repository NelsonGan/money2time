import { useMemo, useSyncExternalStore } from 'react';

import { useApp } from '~/context/AppContext';
import { sharedAlbumFor } from '~/features/cloudSync/services/sharedLedgerStore';

import { listGroupMembers, subscribeAlbumGroups } from '../services/albumGroupStore';

/** Where a shared album's bill on this phone comes from. */
export interface GroupBillOrigin {
  albumId: string;
  /** The album's name here (each person names their own copy). */
  albumName: string | null;
}

/** The shared album a bill is from, for the bill's editor; null for an entry that is not a group's bill. */
export function useGroupBillOrigin(
  transaction: { albumGroupId?: string | null } | null,
): GroupBillOrigin | null {
  const { albums } = useApp();
  const groupId = transaction?.albumGroupId ?? null;
  return useMemo(
    () =>
      groupId
        ? {
            albumId: groupId,
            albumName: albums.find((album) => album.id === groupId)?.name ?? null,
          }
        : null,
    [albums, groupId],
  );
}

/**
 * Everyone still in a shared album but the user: the people a bill of it can
 * be split with (only those who joined, not those who left; README: Album
 * members and shared albums). Undefined for an album that is not shared.
 */
export function useGroupOthers(
  groupId: string | null,
): readonly { id: string; name: string }[] | undefined {
  const members = useSyncExternalStore(subscribeAlbumGroups, () => listGroupMembers(groupId));
  return useMemo(() => {
    if (!groupId) return undefined;
    const userId = sharedAlbumFor(groupId)?.userId ?? null;
    return members
      .filter((member) => !!member.userId && member.userId !== userId)
      .map((member) => ({ id: member.id, name: member.name }));
  }, [groupId, members]);
}
