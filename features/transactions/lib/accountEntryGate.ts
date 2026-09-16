import { PRO_LIMITS } from '~/constants/proLimits';
import type { Account } from '~/types';

/** Every live account occupies one of the six free account slots. */
export function countAccountsTowardFreeLimit(accounts: readonly Account[]): number {
  return accounts.filter((account) => account.deletedAt == null).length;
}

/** Existing data remains usable after Pro expires; only a new transaction is gated. */
export function isNewTransactionBlockedByAccounts(isPro: boolean, activeAccountCount: number) {
  return !isPro && activeAccountCount > PRO_LIMITS.FREE_MAX_ACCOUNTS;
}
