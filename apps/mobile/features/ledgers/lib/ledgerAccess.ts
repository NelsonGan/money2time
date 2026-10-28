import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';

/** Why a ledger cannot be opened now, or null when it can. */
export type LedgerLock = 'pro' | 'paused' | null;

interface Sharing {
  role: 'owner' | 'member';
  active: boolean;
}

/**
 * Ledgers other than the default one need Pro, except a shared one while it
 * is active (anyone in it is Pro): then it opens for everyone in it, owner
 * included, whatever their own Pro. A joined ledger that is paused does not
 * open; the owner's paused ledger needs their own Pro, like any other.
 */
export function ledgerLock(ledgerId: string, isPro: boolean, sharing: Sharing | null): LedgerLock {
  if (ledgerId === DEFAULT_LEDGER_ID) return null;
  if (sharing?.active) return null;
  if (sharing?.role === 'member') return 'paused';
  return isPro ? null : 'pro';
}
