import { useMemo, useSyncExternalStore } from 'react';

import { useApp } from '~/context/AppContext';
import { useCloudSyncEnabled } from '~/features/cloudSync/CloudSyncContext';
import type { SharedLedger } from '~/features/cloudSync/services/sharedLedgerStore';
import { useSharedAlbum, useSharedLedger } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import type { Album, AlbumMember } from '~/types';

import { type AlbumGroupPerson, albumPeople, selfMember } from '../lib/albumPeople';
import { listGroupMembers, subscribeAlbumGroups } from '../services/albumGroupStore';

export interface AlbumGroup {
  /** Whether the album can be split with people: never one in a shared ledger. */
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
  /**
   * Shared albums: the user joined and has to say which name on the list is
   * theirs. Only while there is a name nobody has taken: with none to pick
   * they are put on the list as themselves, unasked (`syncAlbumGroups`).
   */
  mustClaim: boolean;
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
  return useMemo(() => {
    const meLabel = I18n.t('transactions.editor.split.me_label');
    const people = album ? albumPeople(album, share ? members : null, share?.userId, meLabel) : [];
    const self = share ? selfMember(members, share.userId) : null;
    return {
      available: !!album && canSplit,
      canShare: !!album && canShare,
      share,
      people,
      others: people.filter((person) => !person.isSelf),
      self,
      mustClaim: !!share && !self && members.some((member) => !member.userId),
      members,
    };
  }, [album, canShare, canSplit, members, share]);
}
