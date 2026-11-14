import { useMemo, useSyncExternalStore } from 'react';

import { type GroupSpending, groupTotals } from '../lib/albumGroup';
import { type GroupDebt, openShares, pairwiseDebts, simplifyDebts } from '../lib/groupDebts';
import {
  groupSimplifiesDebts,
  listGroupBills,
  listGroupSettlements,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';

interface GroupDebts {
  /** Who owes whom in the group now, simplified when the group has that on. */
  debts: GroupDebt[];
  /** Whether "Simplify group debts" is on. */
  simplified: boolean;
  /** What the group spent, and `selfId`'s part in it, per currency. */
  spending: Map<string, GroupSpending>;
}

/** A shared album's debts and spending, kept current as its group changes; null when not shared. */
export function useGroupDebts(groupId: string | null, selfId: string | null): GroupDebts | null {
  // Deleted bills too: payments made on one stand, owed back (`openShares`).
  const expenses = useSyncExternalStore(subscribeAlbumGroups, () => listGroupBills(groupId));
  const settlements = useSyncExternalStore(subscribeAlbumGroups, () =>
    listGroupSettlements(groupId),
  );
  const simplified = useSyncExternalStore(subscribeAlbumGroups, () =>
    groupId ? groupSimplifiesDebts(groupId) : false,
  );
  return useMemo(() => {
    if (!groupId) return null;
    const open = openShares(expenses, settlements);
    return {
      debts: simplified ? simplifyDebts(open) : pairwiseDebts(open),
      simplified,
      spending: groupTotals(expenses, selfId),
    };
  }, [expenses, groupId, selfId, settlements, simplified]);
}
