import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';

/** Why a ledger cannot be opened now, or null when it can. */
export type LedgerLock = 'pro' | 'paused' | null;

interface Sharing {
  role: 'owner' | 'member';
  active: boolean;
}

/**
 * Ledgers other than the default one need Pro, except one the user joined:
 * that needs its owner's Pro instead, and is paused while they have none.
 */
export function ledgerLock(ledgerId: string, isPro: boolean, sharing: Sharing | null): LedgerLock {
  if (ledgerId === DEFAULT_LEDGER_ID) return null;
  if (sharing?.role === 'member') return sharing.active ? null : 'paused';
  return isPro ? null : 'pro';
}
