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

/**
 * A person's or a bill's shares by date, still owed first: the owed shares
 * by the bill's date, then the paid history by the day it was paid. Part
 * payments make that history long, and it would otherwise push what is still
 * owed below it whenever a payment is newer than the bill.
 */
export function groupSettleUpSharesOwedFirst<T extends { paidAt: string | null }>(
  items: T[],
  billDateOf: (item: T) => string,
): SettleUpDateGroup<T>[] {
  return [
    ...groupSettleUpItemsByDate(
      items.filter((item) => !item.paidAt),
      billDateOf,
    ),
    ...groupSettleUpItemsByDate(
      items.filter((item) => item.paidAt),
      (item) => item.paidAt ?? billDateOf(item),
    ),
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
