import { useMemo, useSyncExternalStore } from 'react';

import { useApp } from '~/context/AppContext';
import { sharedAlbumFor } from '~/features/cloudSync/services/sharedLedgerStore';

import {
  listGroupExpenses,
  listGroupMembers,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';

/** Where a shared album's bill on this phone comes from. */
export interface GroupBillOrigin {
  albumId: string;
  /** The album's name here (each person names their own copy). */
  albumName: string | null;
  /**
   * Who in the album last changed the bill, by the name they go by in it,
   * when that was not the user: null when the user did, or it is not known.
   */
  changedBy: string | null;
  /** Who paid the bill, by the name they go by in the album, when not the user. */
  payerName: string | null;
}

/**
 * The shared album a bill is from and who last changed it, for the bill's
 * editor; null for an entry that is not a group's bill.
 */
export function useGroupBillOrigin(
  transaction: { id: string; albumGroupId?: string | null } | null,
): GroupBillOrigin | null {
  const { albums } = useApp();
  const groupId = transaction?.albumGroupId ?? null;
  const members = useSyncExternalStore(subscribeAlbumGroups, () => listGroupMembers(groupId));
  const expenses = useSyncExternalStore(subscribeAlbumGroups, () => listGroupExpenses(groupId));
  const transactionId = transaction?.id ?? null;
  return useMemo(() => {
    if (!groupId) return null;
    const userId = sharedAlbumFor(groupId)?.userId ?? null;
    const bill = expenses.find((expense) => expense.id === transactionId) ?? null;
    const writer = bill?.createdBy ?? null;
    const payer = bill ? (members.find((member) => member.id === bill.paidBy) ?? null) : null;
    const changedBy =
      writer && writer !== userId
        ? (members.find((member) => member.userId === writer)?.name ?? null)
        : null;
    return {
      albumId: groupId,
      albumName: albums.find((album) => album.id === groupId)?.name ?? null,
      changedBy,
      payerName: payer && payer.userId !== userId ? payer.name : null,
    };
  }, [albums, expenses, groupId, members, transactionId]);
}

/**
 * Everyone in a shared album but the user, the people a bill of it can be
 * split with (only those who joined; README: Album members and shared
 * albums). Empty for an album that is not shared.
 */
export function useGroupOthers(groupId: string | null): readonly { id: string; name: string }[] {
  const members = useSyncExternalStore(subscribeAlbumGroups, () => listGroupMembers(groupId));
  return useMemo(() => {
    const userId = groupId ? (sharedAlbumFor(groupId)?.userId ?? null) : null;
    return members
      .filter((member) => member.userId !== userId)
      .map((member) => ({ id: member.id, name: member.name }));
  }, [groupId, members]);
}
