import { useMemo, useSyncExternalStore } from 'react';

import { useApp } from '~/context/AppContext';
import { useCloudSyncEnabled } from '~/features/cloudSync/CloudSyncContext';
import type { SharedLedger } from '~/features/cloudSync/services/sharedLedgerStore';
import { useSharedAlbum, useSharedLedger } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import type { Album, AlbumMember } from '~/types';

import { type AlbumGroupPerson, albumPeople, selfMember } from '../lib/albumPeople';
import { listGroupMembers, subscribeAlbumGroups } from '../services/albumGroupStore';

export interface AlbumGroup {
  /** Whether the album is split with people: a shared album, never one in a shared ledger. */
  available: boolean;
  /** Whether it can be shared: only an album of the main ledger, while that is not shared. */
  canShare: boolean;
  /** The album's sharing on this phone, or null while it is not shared. */
  share: SharedLedger | null;
  /** Everyone the album is split between, the user first. */
  people: AlbumGroupPerson[];
  /** The others alone: who a new bill starts split with. */
  others: AlbumGroupPerson[];
  /** Shared albums: the user's own member, or null until they are on its list. */
  self: AlbumMember | null;
  /** Shared albums: the group's live members. */
  members: AlbumMember[];
}

/**
 * What an album of the open ledger may do, made yet or not. `canSplit`: it
 * can be split with people, which an album in a shared ledger never is (its
 * entries already belong to the ledger's own). `canShare`: it can be shared,
 * which only an album of the main ledger is, while that ledger is not shared
 * and the build can sync.
 */
export function useAlbumScope(): { canSplit: boolean; canShare: boolean } {
  const { activeLedger } = useApp();
  const canSplit = useSharedLedger(activeLedger.id) === null;
  const canSync = useCloudSyncEnabled();
  return { canSplit, canShare: canSync && canSplit && activeLedger.id === DEFAULT_LEDGER_ID };
}

/**
 * The people of an album, whichever way it keeps them (the album's own list,
 * or its group's members once shared), kept current as either changes.
 */
export function useAlbumGroup(album: Album | null | undefined): AlbumGroup {
  const { canSplit, canShare } = useAlbumScope();
  const share = useSharedAlbum(album?.id);
  const groupId = share ? share.ledgerId : null;
  const members = useSyncExternalStore(subscribeAlbumGroups, () => listGroupMembers(groupId));
  // The user reads as their Settings name, "Me" without one.
  const meLabel = useSelfPerson().name;
  return useMemo(() => {
    const people = album ? albumPeople(album, share ? members : null, share?.userId, meLabel) : [];
    const self = share ? selfMember(members, share.userId) : null;
    return {
      available: !!album && canSplit && !!share,
      canShare: !!album && canShare,
      share,
      people,
      others: people.filter((person) => !person.isSelf),
      self,
      members,
    };
  }, [album, canShare, canSplit, meLabel, members, share]);
}
