import { useCallback, useMemo } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import type { SettleUpSummary } from '~/types';
import { convert } from '~/utils/currency';

import { aggregateUnpaidSplitsByPerson } from './settleUp';

/**
 * The "who owes you" roll-up over all transactions, in the reporting currency.
 * Shared by the Settle Up list and the per-person page so the aggregation +
 * conversion wiring lives in one place. Memoized on the transaction set + rates.
 */
export function useSettleUpSummary(): SettleUpSummary {
  const { settings, rateTable } = useApp();
  const { transactions } = useTransactions();
  const reportingCurrency = settings.currencyCode;

  const rateToReporting = useCallback(
    (currency: string) => convert(1, currency, reportingCurrency, rateTable).rateUsed,
    [rateTable, reportingCurrency],
  );

  return useMemo(
    () => aggregateUnpaidSplitsByPerson(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}
