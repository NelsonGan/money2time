import { PRO_LIMITS } from '~/constants/proLimits';
import type { Account } from '~/types';

/** Match the bank-account free limit: goals and loans have their own separate allowances. */
export function countAccountsTowardFreeLimit(accounts: readonly Account[]): number {
  return accounts.filter(
    (account) =>
      account.deletedAt == null && (account.type === 'debit' || account.type === 'credit'),
  ).length;
}

/** Existing data remains usable after Pro expires; only a new transaction is gated. */
export function isNewTransactionBlockedByAccounts(isPro: boolean, activeAccountCount: number) {
  return !isPro && activeAccountCount > PRO_LIMITS.FREE_MAX_ACCOUNTS;
}
