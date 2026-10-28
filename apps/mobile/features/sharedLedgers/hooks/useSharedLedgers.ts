import { useCallback, useSyncExternalStore } from 'react';

import { useIsPro } from '~/context/ProContext';
import {
  listSharedLedgers,
  type SharedLedger,
  subscribeSharedLedgers,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { type LedgerLock, ledgerLock } from '~/features/ledgers/lib/ledgerAccess';

/** This phone's shared ledgers, re-rendering when the list changes. */
export function useSharedLedgers(): SharedLedger[] {
  return useSyncExternalStore(subscribeSharedLedgers, listSharedLedgers);
}

/** One ledger's sharing, or null when it is not shared. */
export function useSharedLedger(ledgerId: string | undefined): SharedLedger | null {
  const ledgers = useSharedLedgers();
  return ledgers.find((ledger) => ledger.ledgerId === ledgerId) ?? null;
}

/** Why each ledger cannot be opened now (see `ledgerLock`), kept current. */
export function useLedgerLock(): (ledgerId: string) => LedgerLock {
  const isPro = useIsPro();
  const shared = useSharedLedgers();
  return useCallback(
    (ledgerId: string) =>
      ledgerLock(ledgerId, isPro, shared.find((ledger) => ledger.ledgerId === ledgerId) ?? null),
    [isPro, shared],
  );
}
