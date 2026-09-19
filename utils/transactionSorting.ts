import type { TransactionFilters, TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal, timeFromDateLocal } from '~/utils/formatters';

type SortableTransaction = Pick<TransactionWithRelations, 'id' | 'amount' | 'date' | 'createdAt'> &
  Partial<Pick<TransactionWithRelations, 'dayOrder'>>;

/**
 * Where a row sits among rows with the same date: a drag-assigned `dayOrder`,
 * or else when it was created. Both are epoch milliseconds, so a record added
 * after a drag outranks every dragged key and still lands on top. Creation, not
 * the last update, so editing a row (or renaming its category) never moves it.
 */
export function transactionOrderKey(transaction: SortableTransaction): number {
  return transaction.dayOrder ?? Date.parse(transaction.createdAt);
}

function compareOrderKeyDesc(a: SortableTransaction, b: SortableTransaction): number {
  if (a.dayOrder != null || b.dayOrder != null) {
    const keyDelta = transactionOrderKey(b) - transactionOrderKey(a);
    if (keyDelta !== 0) return keyDelta;
  }
  return compareCreatedAtDesc(a, b);
}

function compareOrderKeyAsc(a: SortableTransaction, b: SortableTransaction): number {
  if (a.dayOrder != null || b.dayOrder != null) {
    const keyDelta = transactionOrderKey(a) - transactionOrderKey(b);
    if (keyDelta !== 0) return keyDelta;
  }
  return compareCreatedAtAsc(a, b);
}

function compareCreatedAtDesc(a: SortableTransaction, b: SortableTransaction): number {
  const createdDelta = b.createdAt.localeCompare(a.createdAt);
  if (createdDelta !== 0) return createdDelta;
  return b.id.localeCompare(a.id);
}

function compareCreatedAtAsc(a: SortableTransaction, b: SortableTransaction): number {
  const createdDelta = a.createdAt.localeCompare(b.createdAt);
  if (createdDelta !== 0) return createdDelta;
  return a.id.localeCompare(b.id);
}

// Compared as instants, not text: quick entry stores `YYYY-MM-DD` and the
// editor a full ISO string, and as text their order depended on the timezone.
function timeDelta(
  a: SortableTransaction,
  b: SortableTransaction,
  resolveTime: (dateText: string) => number,
): number {
  return a.date === b.date ? 0 : resolveTime(a.date) - resolveTime(b.date);
}

export function compareTransactionsByDateDesc(
  a: SortableTransaction,
  b: SortableTransaction,
  resolveDayKey: (dateIso: string) => string = dayKeyFromIsoLocal,
  resolveTime: (dateText: string) => number = timeFromDateLocal,
): number {
  const dayDelta = resolveDayKey(b.date).localeCompare(resolveDayKey(a.date));
  if (dayDelta !== 0) return dayDelta;
  const timeDiff = timeDelta(b, a, resolveTime);
  if (timeDiff !== 0) return timeDiff;
  return compareOrderKeyDesc(a, b);
}

export function compareTransactionsByDateAsc(
  a: SortableTransaction,
  b: SortableTransaction,
  resolveDayKey: (dateIso: string) => string = dayKeyFromIsoLocal,
  resolveTime: (dateText: string) => number = timeFromDateLocal,
): number {
  const dayDelta = resolveDayKey(a.date).localeCompare(resolveDayKey(b.date));
  if (dayDelta !== 0) return dayDelta;
  const timeDiff = timeDelta(a, b, resolveTime);
  if (timeDiff !== 0) return timeDiff;
  return compareOrderKeyAsc(a, b);
}

export function sortTransactions<T extends SortableTransaction>(
  transactions: readonly T[],
  sortBy: TransactionFilters['sortBy'],
): T[] {
  if (transactions.length < 2) {
    return transactions as T[];
  }

  const dayKeyByDate = new Map<string, string>();
  const resolveDayKey = (dateIso: string) => {
    const cached = dayKeyByDate.get(dateIso);
    if (cached !== undefined) return cached;
    const next = dayKeyFromIsoLocal(dateIso);
    dayKeyByDate.set(dateIso, next);
    return next;
  };
  const timeByDate = new Map<string, number>();
  const resolveTime = (dateText: string) => {
    const cached = timeByDate.get(dateText);
    if (cached !== undefined) return cached;
    const next = timeFromDateLocal(dateText);
    timeByDate.set(dateText, next);
    return next;
  };
  const compareByDateDesc = (a: T, b: T) =>
    compareTransactionsByDateDesc(a, b, resolveDayKey, resolveTime);
  const compareByDateAsc = (a: T, b: T) =>
    compareTransactionsByDateAsc(a, b, resolveDayKey, resolveTime);
  const ensureSorted = (comparator: (a: T, b: T) => number): T[] => {
    for (let index = 1; index < transactions.length; index += 1) {
      const previous = transactions[index - 1];
      const current = transactions[index];
      if (!previous || !current) continue;
      if (comparator(previous, current) > 0) {
        const sorted = [...transactions];
        sorted.sort(comparator);
        return sorted;
      }
    }
    return transactions as T[];
  };
  switch (sortBy) {
    case 'date_asc':
      return ensureSorted(compareByDateAsc);
    case 'amount_desc':
      return ensureSorted((a, b) => {
        const amountDelta = b.amount - a.amount;
        if (amountDelta !== 0) return amountDelta;
        return compareByDateDesc(a, b);
      });
    case 'amount_asc':
      return ensureSorted((a, b) => {
        const amountDelta = a.amount - b.amount;
        if (amountDelta !== 0) return amountDelta;
        return compareByDateAsc(a, b);
      });
    case 'date_desc':
    default:
      return ensureSorted(compareByDateDesc);
  }
}
