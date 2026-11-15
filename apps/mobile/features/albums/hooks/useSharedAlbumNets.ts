import { useMemo, useSyncExternalStore } from 'react';

import { useSharedAlbums } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import type { AlbumExpense, AlbumMember, AlbumSettlement } from '~/types';

import { selfMember } from '../lib/albumPeople';
import { openShares } from '../lib/groupDebts';
import { type SelfNet, selfNet } from '../lib/selfNet';
import {
  listGroupBills,
  listGroupMembers,
  listGroupSettlements,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';

/**
 * Each group's last figure, with what it came from. The store hands back the
 * same arrays until a group changes, so a group nothing happened to is not
 * worked out again.
 */
const cache = new Map<
  string,
  {
    bills: AlbumExpense[];
    settlements: AlbumSettlement[];
    members: AlbumMember[];
    userId: string;
    reportingCurrency: string;
    net: SelfNet;
  }
>();

function groupSelfNet(groupId: string, userId: string, reportingCurrency: string): SelfNet {
  const bills = listGroupBills(groupId);
  const settlements = listGroupSettlements(groupId);
  const members = listGroupMembers(groupId);
  const known = cache.get(groupId);
  if (
    known &&
    known.bills === bills &&
    known.settlements === settlements &&
    known.members === members &&
    known.userId === userId &&
    known.reportingCurrency === reportingCurrency
  ) {
    return known.net;
  }
  const self = selfMember(members, userId);
  const net = selfNet(openShares(bills, settlements), self?.id ?? null, reportingCurrency);
  cache.set(groupId, { bills, settlements, members, userId, reportingCurrency, net });
  return net;
}

// Moves on every change to any group, so a memo over several groups knows to
// look again.
let groupsVersion = 0;
const subscribeGroupsVersion = (listener: () => void) =>
  subscribeAlbumGroups(() => {
    groupsVersion += 1;
    listener();
  });
const getGroupsVersion = () => groupsVersion;

/**
 * The user's net in each shared album on this phone where they owe or are
 * owed something, by album id: the same figure the album's Balances tab
 * opens on (`selfNet`). Worked out again only when a group changes.
 */
export function useSharedAlbumNets(reportingCurrency: string): ReadonlyMap<string, SelfNet> {
  const shares = useSharedAlbums();
  const version = useSyncExternalStore(subscribeGroupsVersion, getGroupsVersion);
  return useMemo(() => {
    const nets = new Map<string, SelfNet>();
    for (const share of shares) {
      if (!share.userId) continue;
      const net = groupSelfNet(share.ledgerId, share.userId, reportingCurrency);
      if (net.involved) nets.set(share.ledgerId, net);
    }
    return nets;
    // `version` is what says a group changed: the store's reads are not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportingCurrency, shares, version]);
}
