import type { TransactionFilters, TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

type SortableTransaction = Pick<
  TransactionWithRelations,
  'id' | 'amount' | 'date' | 'createdAt' | 'updatedAt'
>;

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

function compareUpdatedAtDesc(a: SortableTransaction, b: SortableTransaction): number {
  const updatedDelta = b.updatedAt.localeCompare(a.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;
  return compareCreatedAtDesc(a, b);
}

function compareUpdatedAtAsc(a: SortableTransaction, b: SortableTransaction): number {
  const updatedDelta = a.updatedAt.localeCompare(b.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;
  return compareCreatedAtAsc(a, b);
}

export function compareTransactionsByDateDesc(
  a: SortableTransaction,
  b: SortableTransaction,
  resolveDayKey: (dateIso: string) => string = dayKeyFromIsoLocal,
): number {
  const dayDelta = resolveDayKey(b.date).localeCompare(resolveDayKey(a.date));
  if (dayDelta !== 0) return dayDelta;
  return compareUpdatedAtDesc(a, b);
}

export function compareTransactionsByDateAsc(
  a: SortableTransaction,
  b: SortableTransaction,
  resolveDayKey: (dateIso: string) => string = dayKeyFromIsoLocal,
): number {
  const dayDelta = resolveDayKey(a.date).localeCompare(resolveDayKey(b.date));
  if (dayDelta !== 0) return dayDelta;
  return compareUpdatedAtAsc(a, b);
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
  const compareByDateDesc = (a: T, b: T) => compareTransactionsByDateDesc(a, b, resolveDayKey);
  const compareByDateAsc = (a: T, b: T) => compareTransactionsByDateAsc(a, b, resolveDayKey);
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
