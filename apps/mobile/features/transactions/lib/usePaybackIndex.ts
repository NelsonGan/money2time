import { useMemo, useRef } from 'react';

import { useTransactions } from '~/context/AppContext';

import { indexPaybacks, type PaybackLink, samePaybackIndex } from './paybackGroups';

/**
 * Every payback transfer by id, from all transactions (a payback's bill can be
 * in another month than the payback). Keeps its identity while the paybacks
 * stay the same, so an unrelated edit does not redraw every day of a list.
 */
export function usePaybackIndex(): ReadonlyMap<string, PaybackLink> {
  const { transactions } = useTransactions();
  const previous = useRef<ReadonlyMap<string, PaybackLink>>(new Map());
  return useMemo(() => {
    const next = indexPaybacks(transactions);
    if (samePaybackIndex(previous.current, next)) return previous.current;
    previous.current = next;
    return next;
  }, [transactions]);
}
