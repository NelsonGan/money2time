import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { useOpenLedgerSharedAndActive } from '~/features/sharedLedgers/hooks/useSharedLedgers';

import {
  countAccountsTowardFreeLimit,
  isNewTransactionBlockedByAccounts,
} from '../lib/accountEntryGate';

/**
 * Whether the account limit blocks a new transaction in the open ledger, for
 * every in-app entry point. An active shared ledger never blocks.
 */
export function useNewTransactionGate(): { blocked: boolean; activeAccountCount: number } {
  const { accounts } = useApp();
  const isPro = useIsPro();
  const inSharedLedger = useOpenLedgerSharedAndActive();
  const activeAccountCount = countAccountsTowardFreeLimit(accounts);
  return {
    blocked: isNewTransactionBlockedByAccounts(isPro, activeAccountCount, inSharedLedger),
    activeAccountCount,
  };
}
