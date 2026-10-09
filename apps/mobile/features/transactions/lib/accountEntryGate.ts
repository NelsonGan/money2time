import { PRO_LIMITS } from '~/constants/proLimits';
import type { Account } from '~/types';

/** Savings goals have their own limit and do not use an account slot. */
export function countAccountsTowardFreeLimit(accounts: readonly Account[]): number {
  return accounts.filter((account) => account.deletedAt == null && account.type !== 'goal').length;
}

/** Existing data remains usable after Pro expires; only a new transaction is gated. */
export function isNewTransactionBlockedByAccounts(isPro: boolean, activeAccountCount: number) {
  return !isPro && activeAccountCount > PRO_LIMITS.FREE_MAX_ACCOUNTS;
}
