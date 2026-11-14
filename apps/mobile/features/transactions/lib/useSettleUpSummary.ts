import { useCallback, useMemo } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import type { Album, SettleUpByTransactionSummary, SettleUpSummary } from '~/types';
import { convert } from '~/utils/currency';

import {
  aggregateSettleUpByPerson,
  aggregateSettleUpByTransaction,
  countUnpaidDebtors,
} from './settleUp';

/**
 * Which bills a roll-up covers. A shared album answers for the bills in it,
 * and the Balances page for every other split bill (in an album of the
 * user's own or in none).
 * `all` is for looking one bill up, wherever it is.
 */
type SettleUpScope = { albumId: string } | 'outside_albums' | 'all';

/** Shared reporting-currency wiring for the Settle Up roll-ups, over the bills of `scope`. */
function useSettleUpContext(scope: SettleUpScope) {
  const { settings, rateTable, getAlbumEntryIds, getAlbumOwnedTransactionIds, albums } = useApp();
  const { transactions: all } = useTransactions();
  const reportingCurrency = settings.currencyCode;
  const albumId = typeof scope === 'object' ? scope.albumId : null;
  const transactions = useMemo(() => {
    if (scope === 'all') return all;
    if (albumId) {
      // The cached membership, not a database read on every recompute.
      const ids = new Set(getAlbumEntryIds().get(albumId));
      return all.filter((transaction) => ids.has(transaction.id));
    }
    const inAlbums = getAlbumOwnedTransactionIds();
    return inAlbums.size ? all.filter((transaction) => !inAlbums.has(transaction.id)) : all;
    // `albums` changes when an album's entries do, and with the open ledger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, all, albums, getAlbumEntryIds, getAlbumOwnedTransactionIds, scope === 'all']);

  const rateToReporting = useCallback(
    (currency: string) => convert(1, currency, reportingCurrency, rateTable).rateUsed,
    [rateTable, reportingCurrency],
  );

  return { transactions, reportingCurrency, rateToReporting };
}

/**
 * The "who owes whom" roll-up grouped by person, in the reporting currency:
 * over one shared album's bills, or without `albumId` over every bill not in
 * a shared album (the Balances page). Memoized on the transactions + rates.
 */
export function useSettleUpSummary(albumId?: string): SettleUpSummary {
  const scope = useMemo<SettleUpScope>(() => (albumId ? { albumId } : 'outside_albums'), [albumId]);
  const { transactions, reportingCurrency, rateToReporting } = useSettleUpContext(scope);
  return useMemo(
    () => aggregateSettleUpByPerson(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}

/**
 * The same roll-up grouped by transaction instead of by person: the bills in
 * no album for the Balances page's Transactions tab, `all` for a bill's own
 * page.
 */
export function useSettleUpByTransaction(
  scope: 'outside_albums' | 'all',
): SettleUpByTransactionSummary {
  const { transactions, reportingCurrency, rateToReporting } = useSettleUpContext(scope);
  return useMemo(
    () => aggregateSettleUpByTransaction(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );
}

/** An album with something still owed in it, and the user's net there (reporting currency). */
export interface AlbumBalance {
  album: Album;
  netReporting: number;
}

/** The albums that still have open bills, for the Balances page: each is settled in the album. */
export function useAlbumBalances(): AlbumBalance[] {
  const { settings, rateTable, albums, getAlbumEntryIds, getAlbumOwnedTransactionIds } = useApp();
  const { transactions } = useTransactions();
  const reportingCurrency = settings.currencyCode;
  return useMemo(() => {
    if (getAlbumOwnedTransactionIds().size === 0) return [];
    const rateToReporting = (currency: string) =>
      convert(1, currency, reportingCurrency, rateTable).rateUsed;
    const entryIds = getAlbumEntryIds();
    // Only split bills can be owed on: found once, not once per album.
    const bills = transactions.filter((transaction) => transaction.splits?.length);
    const owned = getAlbumOwnedTransactionIds();
    return albums.flatMap((album) => {
      // Only a shared album settles its own bills.
      const ids = new Set((entryIds.get(album.id) ?? []).filter((id) => owned.has(id)));
      if (ids.size === 0) return [];
      const summary = aggregateSettleUpByPerson(
        bills.filter((transaction) => ids.has(transaction.id)),
        { reportingCurrency, rateToReporting },
      );
      return summary.billCount > 0 ? [{ album, netReporting: summary.netReporting }] : [];
    });
  }, [
    albums,
    getAlbumEntryIds,
    getAlbumOwnedTransactionIds,
    rateTable,
    reportingCurrency,
    transactions,
  ]);
}

/**
 * Just the count of people who still owe — no reporting-currency wiring, no
 * bill/sort work. For the always-mounted Settings badge, which would otherwise
 * run the full per-person roll-up on every transaction write across the app.
 */
export function useUnpaidPersonCount(): number {
  const { transactions } = useTransactions();
  return useMemo(() => countUnpaidDebtors(transactions), [transactions]);
}
