import { useCallback, useMemo } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import type { SettleUpByTransactionSummary, SettleUpSummary } from '~/types';
import { convert } from '~/utils/currency';

import { aggregateUnpaidSplitsByPerson, aggregateUnpaidSplitsByTransaction } from './settleUp';

/** Shared reporting-currency wiring for the Settle Up roll-ups. */
function useSettleUpContext() {
  const { settings, rateTable } = useApp();
  const { transactions } = useTransactions();
  const reportingCurrency = settings.currencyCode;

  const rateToReporting = useCallback(
    (currency: string) => convert(1, currency, reportingCurrency, rateTable).rateUsed,
    [rateTable, reportingCurrency],
  );

  return { transactions, reportingCurrency, rateToReporting };
}

/**
 * The "who owes you" roll-up over all transactions, grouped by person, in the
 * reporting currency. Shared by the Settle Up list and the per-person page so
 * the aggregation wiring lives in one place. Memoized on the transactions + rates.
 */
export function useSettleUpSummary(): SettleUpSummary {
  const { transactions, reportingCurrency, rateToReporting } = useSettleUpContext();
  return useMemo(
    () => aggregateUnpaidSplitsByPerson(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}

/**
 * The same roll-up grouped by transaction instead of by person, for the
 * by-transaction tab and the per-transaction page.
 */
export function useSettleUpByTransaction(): SettleUpByTransactionSummary {
  const { transactions, reportingCurrency, rateToReporting } = useSettleUpContext();
  return useMemo(
    () => aggregateUnpaidSplitsByTransaction(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}
