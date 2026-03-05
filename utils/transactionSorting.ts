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
): number {
  const dayDelta = dayKeyFromIsoLocal(b.date).localeCompare(dayKeyFromIsoLocal(a.date));
  if (dayDelta !== 0) return dayDelta;
  return compareUpdatedAtDesc(a, b);
}

export function compareTransactionsByDateAsc(
  a: SortableTransaction,
  b: SortableTransaction,
): number {
  const dayDelta = dayKeyFromIsoLocal(a.date).localeCompare(dayKeyFromIsoLocal(b.date));
  if (dayDelta !== 0) return dayDelta;
  return compareUpdatedAtAsc(a, b);
}

export function sortTransactions<T extends SortableTransaction>(
  transactions: readonly T[],
  sortBy: TransactionFilters['sortBy'],
): T[] {
  const sorted = [...transactions];
  switch (sortBy) {
    case 'date_asc':
      sorted.sort(compareTransactionsByDateAsc);
      break;
    case 'amount_desc':
      sorted.sort((a, b) => {
        const amountDelta = b.amount - a.amount;
        if (amountDelta !== 0) return amountDelta;
        return compareTransactionsByDateDesc(a, b);
      });
      break;
    case 'amount_asc':
      sorted.sort((a, b) => {
        const amountDelta = a.amount - b.amount;
        if (amountDelta !== 0) return amountDelta;
        return compareTransactionsByDateAsc(a, b);
      });
      break;
    case 'date_desc':
    default:
      sorted.sort(compareTransactionsByDateDesc);
      break;
  }

  return sorted;
}
