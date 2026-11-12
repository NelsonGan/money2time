import { useMemo, useSyncExternalStore } from 'react';

import { useApp } from '~/context/AppContext';
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
  /** Shared albums: the user's own member, or null until they have said who they are. */
  self: AlbumMember | null;
  /** Shared albums: the group's live members. */
  members: AlbumMember[];
}

const NO_MEMBERS: AlbumMember[] = [];

/**
 * The people of an album, whichever way it keeps them (the album's own list,
 * or its group's members once shared), kept current as either changes.
 */
export function useAlbumGroup(album: Album | null | undefined): AlbumGroup {
  const { activeLedger } = useApp();
  const share = useSharedAlbum(album?.id);
  const inSharedLedger = useSharedLedger(activeLedger.id) !== null;
  const groupId = share ? share.ledgerId : null;
  const members = useSyncExternalStore(subscribeAlbumGroups, () =>
    groupId ? listGroupMembers(groupId) : NO_MEMBERS,
  );
  return useMemo(() => {
    const meLabel = I18n.t('transactions.editor.split.me_label');
    const people = album ? albumPeople(album, share ? members : null, share?.userId, meLabel) : [];
    return {
      available: !!album && !inSharedLedger,
      canShare: !!album && !inSharedLedger && activeLedger.id === DEFAULT_LEDGER_ID,
      share,
      people,
      others: people.filter((person) => !person.isSelf),
      self: share ? selfMember(members, share.userId) : null,
      members,
    };
  }, [activeLedger.id, album, inSharedLedger, members, share]);
}
