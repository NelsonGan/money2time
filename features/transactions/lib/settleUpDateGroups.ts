import type { PersonDebt, TransactionDebt } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

export interface SettleUpDateGroup<T> {
  dayKey: string;
  items: T[];
}

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
