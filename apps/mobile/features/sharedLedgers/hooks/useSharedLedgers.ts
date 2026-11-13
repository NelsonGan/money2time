import { useCallback, useSyncExternalStore } from 'react';

import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import {
  listAlbumShares,
  listLedgerShares,
  type SharedLedger,
  subscribeSharedLedgers,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { type LedgerLock, ledgerLock } from '~/features/ledgers/lib/ledgerAccess';

/** This phone's shared ledgers, re-rendering when the list changes. Shared albums are not among them. */
export function useSharedLedgers(): SharedLedger[] {
  return useSyncExternalStore(subscribeSharedLedgers, listLedgerShares);
}

/** This phone's shared albums' groups, re-rendering when the list changes. */
export function useSharedAlbums(): SharedLedger[] {
  return useSyncExternalStore(subscribeSharedLedgers, listAlbumShares);
}

/** One album's sharing, by the album's id, or null when it is not shared. */
export function useSharedAlbum(albumId: string | undefined): SharedLedger | null {
  const albums = useSharedAlbums();
  return albums.find((share) => share.ledgerId === albumId) ?? null;
}

/** One ledger's sharing, or null when it is not shared. */
export function useSharedLedger(ledgerId: string | undefined): SharedLedger | null {
  const ledgers = useSharedLedgers();
  return ledgers.find((ledger) => ledger.ledgerId === ledgerId) ?? null;
}

/**
 * Whether the open ledger is shared and active (anyone in it Pro), so free
 * members log in it whatever its account count. False for a paused one.
 */
export function useOpenLedgerSharedAndActive(): boolean {
  const { activeLedger } = useApp();
  return useSharedLedger(activeLedger.id)?.active === true;
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
