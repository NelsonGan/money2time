import { PRO_LIMITS } from '~/constants/proLimits';
import type { Account } from '~/types';

/** Soft-deleted rows are normally absent from useApp().accounts, but exclude them defensively. */
export function countActiveAccounts(accounts: readonly Account[]): number {
  return accounts.filter((account) => {
    if (account.deletedAt != null) return false;
    if (account.type === 'goal') return account.goalArchivedAt == null;
    if (account.type === 'loan') return account.loanArchivedAt == null;
    return true;
  }).length;
}

/** Existing data remains usable after Pro expires; only a new transaction is gated. */
export function isNewTransactionBlockedByAccounts(isPro: boolean, activeAccountCount: number) {
  return !isPro && activeAccountCount > PRO_LIMITS.FREE_MAX_ACCOUNTS;
}
