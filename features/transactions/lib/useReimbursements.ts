import { useCallback, useMemo } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import type { ReimbursementsSummary } from '~/types';
import { convert } from '~/utils/currency';

import {
  aggregatePendingClaimsByPayer,
  aggregateReimbursedClaimsByPayer,
  countPendingClaims,
  recentPayerNames,
} from './reimbursements';

/** Shared reporting-currency wiring for the reimbursement roll-ups. */
function useReimbursementContext() {
  const { settings, rateTable } = useApp();
  const { transactions } = useTransactions();
  const reportingCurrency = settings.currencyCode;

  const rateToReporting = useCallback(
    (currency: string) => convert(1, currency, reportingCurrency, rateTable).rateUsed,
    [rateTable, reportingCurrency],
  );

  return { transactions, reportingCurrency, rateToReporting };
}

/** Open claims grouped by payer, in the reporting currency. */
export function usePendingReimbursements(): ReimbursementsSummary {
  const { transactions, reportingCurrency, rateToReporting } = useReimbursementContext();
  return useMemo(
    () => aggregatePendingClaimsByPayer(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}

/** Already-cleared claims, for the history tab and undo. */
export function useReimbursedClaims(): ReimbursementsSummary {
  const { transactions, reportingCurrency, rateToReporting } = useReimbursementContext();
  return useMemo(
    () => aggregateReimbursedClaimsByPayer(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}

/**
 * Just the count of open claims — no reporting-currency wiring, no grouping or
 * sorting. For the always-mounted Settings badge, and for the free-plan gate,
 * both of which would otherwise run the full per-payer roll-up on every
 * transaction write anywhere in the app.
 */
export function usePendingClaimCount(): number {
  const { transactions } = useTransactions();
  return useMemo(() => countPendingClaims(transactions), [transactions]);
}

/** Payer names the user has used before, for the claim sheet's autocomplete. */
export function useRecentPayerNames(): string[] {
  const { transactions } = useTransactions();
  return useMemo(() => recentPayerNames(transactions), [transactions]);
}
