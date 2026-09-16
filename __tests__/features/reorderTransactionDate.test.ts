import {
  dateUpdatesForDrag,
  type ReorderRow,
} from '~/features/transactions/lib/reorderTransactionDate';
import type { TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { sortTransactions } from '~/utils/transactionSorting';

function transaction(id: string, day: number, hour: number): TransactionWithRelations {
  const date = new Date(2026, 4, day, hour).toISOString();
  return {
    id,
    date,
    amount: 1,
    createdAt: date,
    updatedAt: date,
  } as TransactionWithRelations;
}

function day(day: number): ReorderRow {
  return { kind: 'day', id: `day-${day}`, dayKey: `2026-05-${String(day).padStart(2, '0')}` };
}

function row(tx: TransactionWithRelations): ReorderRow {
  return { kind: 'transaction', id: tx.id, transaction: tx };
}

function sortWithUpdates(
  rows: ReorderRow[],
  updates: ReturnType<typeof dateUpdatesForDrag>,
): string[] {
  const dateById = new Map(updates.map((update) => [update.id, update.date]));
  const transactions = rows.flatMap((entry) =>
    entry.kind === 'transaction'
      ? [{ ...entry.transaction, date: dateById.get(entry.id) ?? entry.transaction.date }]
      : [],
  );
  return sortTransactions(transactions, 'date_desc').map((tx) => tx.id);
}

describe('transaction drag dates', () => {
  it('changes only the moved row time when there is room between same-day rows', () => {
    const newer = transaction('newer', 13, 18);
    const middle = transaction('middle', 13, 12);
    const older = transaction('older', 13, 8);
    const dropped = [day(13), row(newer), row(older), row(middle)];
    const updates = dateUpdatesForDrag(dropped, 'older');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe('older');
    expect(dayKeyFromIsoLocal(updates[0]!.date)).toBe('2026-05-13');
    expect(sortWithUpdates(dropped, updates)).toEqual(['newer', 'older', 'middle']);
  });

  it('moves a row across day sections by changing its calendar date', () => {
    const newer = transaction('newer', 14, 18);
    const older = transaction('older', 14, 8);
    const moved = transaction('moved', 13, 12);
    const dropped = [day(14), row(newer), row(moved), row(older), day(13)];
    const updates = dateUpdatesForDrag(dropped, 'moved');
    expect(updates).toHaveLength(1);
    expect(dayKeyFromIsoLocal(updates[0]!.date)).toBe('2026-05-14');
    expect(sortWithUpdates(dropped, updates)).toEqual(['newer', 'moved', 'older']);
  });

  it('retimes one crowded day when date-only rows leave no time gap', () => {
    const first = transaction('first', 13, 0);
    const second = transaction('second', 13, 0);
    const moved = transaction('moved', 13, 0);
    const dropped = [day(13), row(first), row(moved), row(second)];
    const updates = dateUpdatesForDrag(dropped, 'moved');
    expect(updates).toHaveLength(3);
    expect(updates.every((update) => dayKeyFromIsoLocal(update.date) === '2026-05-13')).toBe(true);
    expect(sortWithUpdates(dropped, updates)).toEqual(['first', 'moved', 'second']);
  });

  it('places a row dropped above the first header at the top of that day', () => {
    const first = transaction('first', 13, 18);
    const moved = transaction('moved', 12, 8);
    const dropped = [row(moved), day(13), row(first), day(12)];
    const updates = dateUpdatesForDrag(dropped, 'moved');
    expect(dayKeyFromIsoLocal(updates[0]!.date)).toBe('2026-05-13');
    expect(sortWithUpdates(dropped, updates)).toEqual(['moved', 'first']);
  });

  it('does not mutate a lone row dropped above its own header', () => {
    const moved = transaction('moved', 13, 12);
    const dropped = [row(moved), day(13)];

    expect(dateUpdatesForDrag(dropped, 'moved')).toEqual([]);
  });
});
