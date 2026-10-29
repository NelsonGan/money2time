import { PRO_LIMITS } from '~/constants/proLimits';
import type { Account } from '~/types';

/** Savings goals have their own limit and do not use an account slot. */
export function countAccountsTowardFreeLimit(accounts: readonly Account[]): number {
  return accounts.filter((account) => account.deletedAt == null && account.type !== 'goal').length;
}

/**
 * Existing data remains usable after Pro expires; only a new transaction is
 * gated. A shared ledger that is open (anyone in it Pro) never is: a free
 * member logs in it whatever its account count, since only its owner can
 * trim its accounts. Creating accounts there keeps the usual limit.
 */
export function isNewTransactionBlockedByAccounts(
  isPro: boolean,
  activeAccountCount: number,
  inSharedLedger = false,
) {
  return !isPro && !inSharedLedger && activeAccountCount > PRO_LIMITS.FREE_MAX_ACCOUNTS;
}
