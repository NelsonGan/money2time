import type { PersonDebt, TransactionDebt } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

export interface SettleUpDateGroup<T> {
  dayKey: string;
  items: T[];
}

export type SettleUpSearchResult =
  | { kind: 'person'; person: PersonDebt }
  | { kind: 'transaction'; transaction: TransactionDebt };

/** Keep each day's current item order while showing newer days first. */
export function groupSettleUpItemsByDate<T>(
  items: T[],
  dateOf: (item: T) => string,
): SettleUpDateGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const dayKey = dayKeyFromIsoLocal(dateOf(item));
    const group = byDay.get(dayKey);
    if (group) group.push(item);
    else byDay.set(dayKey, [item]);
  }
  return Array.from(byDay, ([dayKey, groupedItems]) => ({ dayKey, items: groupedItems })).sort(
    (a, b) => b.dayKey.localeCompare(a.dayKey),
  );
}

/** One share's card on the person and bill pages, with its payments in it. */
export interface SettleUpShareCard<T> {
  /** The row the card acts on: what is still owed, or for a share paid back in
   *  full its newest payment. */
  share: T;
  /** The share's paid rows, newest first (several for a share paid in parts). */
  payments: T[];
}

/**
 * A person's or a bill's shares as cards: one card per share with its
 * payments in it, so part payments do not each take a card. `owed` keeps the
 * order `items` gives the shares; `settled` (paid back in full) is newest
 * payment first.
 */
export function buildSettleUpShareCards<T extends { shareKey: string; paidAt: string | null }>(
  items: T[],
): { owed: SettleUpShareCard<T>[]; settled: SettleUpShareCard<T>[] } {
  const byShare = new Map<string, T[]>();
  for (const item of items) {
    const rows = byShare.get(item.shareKey);
    if (rows) rows.push(item);
    else byShare.set(item.shareKey, [item]);
  }
  const owed: SettleUpShareCard<T>[] = [];
  const settled: SettleUpShareCard<T>[] = [];
  for (const rows of byShare.values()) {
    const payments = rows
      .filter((row) => row.paidAt)
      .sort((a, b) => ((a.paidAt ?? '') < (b.paidAt ?? '') ? 1 : -1));
    const unpaid = rows.filter((row) => !row.paidAt);
    // A share owes on one row; any other (an undone payment the fold missed)
    // still gets a card of its own rather than disappear.
    unpaid.forEach((share, index) => owed.push({ share, payments: index === 0 ? payments : [] }));
    if (unpaid.length === 0 && payments[0]) settled.push({ share: payments[0], payments });
  }
  settled.sort((a, b) => ((a.share.paidAt ?? '') < (b.share.paidAt ?? '') ? 1 : -1));
  return { owed, settled };
}

/**
 * {@link buildSettleUpShareCards} by date, still owed first: what is owed by
 * the bill's date, then the shares paid back in full by the day the last
 * payment came in.
 */
export function groupSettleUpShareCards<T extends { shareKey: string; paidAt: string | null }>(
  items: T[],
  billDateOf: (item: T) => string,
): SettleUpDateGroup<SettleUpShareCard<T>>[] {
  const { owed, settled } = buildSettleUpShareCards(items);
  return [
    ...groupSettleUpItemsByDate(owed, (card) => billDateOf(card.share)),
    ...groupSettleUpItemsByDate(settled, (card) => card.share.paidAt ?? billDateOf(card.share)),
  ];
}

export function groupSettleUpPeopleByDate(people: PersonDebt[]): SettleUpDateGroup<PersonDebt>[] {
  return groupSettleUpItemsByDate(people, (person) => {
    let latestUnpaidDate = '';
    let latestPaidAt = '';
    for (const bill of person.bills) {
      if (bill.paidAt) {
        if (bill.paidAt > latestPaidAt) latestPaidAt = bill.paidAt;
      } else if (bill.date > latestUnpaidDate) {
        latestUnpaidDate = bill.date;
      }
    }
    return latestUnpaidDate || latestPaidAt || person.oldestDate;
  });
}

export function groupSettleUpTransactionsByDate(
  transactions: TransactionDebt[],
): SettleUpDateGroup<TransactionDebt>[] {
  return groupSettleUpItemsByDate(transactions, (bill) =>
    bill.unpaidSplitCount > 0 ? bill.date : (bill.latestPaidAt ?? bill.date),
  );
}

/** Combine both card types under the same date headings for search. */
export function groupSettleUpSearchResultsByDate(
  people: PersonDebt[],
  transactions: TransactionDebt[],
): SettleUpDateGroup<SettleUpSearchResult>[] {
  const byDay = new Map<string, SettleUpSearchResult[]>();
  for (const group of groupSettleUpPeopleByDate(people)) {
    byDay.set(
      group.dayKey,
      group.items.map((person) => ({ kind: 'person', person })),
    );
  }
  for (const group of groupSettleUpTransactionsByDate(transactions)) {
    const items = byDay.get(group.dayKey) ?? [];
    items.push(
      ...group.items.map((transaction) => ({ kind: 'transaction' as const, transaction })),
    );
    byDay.set(group.dayKey, items);
  }
  return Array.from(byDay, ([dayKey, items]) => ({ dayKey, items })).sort((a, b) =>
    b.dayKey.localeCompare(a.dayKey),
  );
}
