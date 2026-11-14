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
 * and the build can sync. Who may make one is the shared-albums rollout,
 * asked only by New Album (`useSharedAlbumsAllowed`).
 */
export function useAlbumScope(): { canSplit: boolean; canShare: boolean } {
  const { activeLedger } = useApp();
  const canSplit = useSharedLedger(activeLedger.id) === null;
  const canSync = useCloudSyncEnabled();
  return { canSplit, canShare: canSync && canSplit && activeLedger.id === DEFAULT_LEDGER_ID };
}

/**
 * The people of an album: a shared album's group members, kept current as
 * they change; an album that is not shared has only the user.
 */
export function useAlbumGroup(album: Album | null | undefined): AlbumGroup {
  const { canSplit } = useAlbumScope();
  const share = useSharedAlbum(album?.id);
  const groupId = share ? share.ledgerId : null;
  const members = useSyncExternalStore(subscribeAlbumGroups, () => listGroupMembers(groupId));
  // The user reads as their Settings name, "Me" without one.
  const meLabel = useSelfPerson().name;
  return useMemo(() => {
    const people = album ? albumPeople(share ? members : null, share?.userId, meLabel) : [];
    const self = share ? selfMember(members, share.userId) : null;
    return {
      available: !!album && canSplit && !!share,
      share,
      people,
      others: people.filter((person) => !person.isSelf),
      self,
      members,
    };
  }, [album, canSplit, meLabel, members, share]);
}
