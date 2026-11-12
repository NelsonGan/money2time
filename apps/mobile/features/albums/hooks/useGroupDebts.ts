import { useMemo, useSyncExternalStore } from 'react';

import type { AlbumExpense, AlbumSettlement } from '~/types';

import { type GroupSpending, groupTotals } from '../lib/albumGroup';
import { type GroupDebt, openShares, pairwiseDebts, simplifyDebts } from '../lib/groupDebts';
import {
  groupSimplifiesDebts,
  listGroupExpenses,
  listGroupSettlements,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';

const NO_EXPENSES: AlbumExpense[] = [];
const NO_SETTLEMENTS: AlbumSettlement[] = [];

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
  const expenses = useSyncExternalStore(subscribeAlbumGroups, () =>
    groupId ? listGroupExpenses(groupId) : NO_EXPENSES,
  );
  const settlements = useSyncExternalStore(subscribeAlbumGroups, () =>
    groupId ? listGroupSettlements(groupId) : NO_SETTLEMENTS,
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
