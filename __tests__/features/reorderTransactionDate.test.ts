import {
  type ReorderRow,
  type ReorderUpdate,
  reorderUpdatesForDrag,
} from '~/features/transactions/lib/reorderTransactionDate';
import type { TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { sortTransactions } from '~/utils/transactionSorting';

const NOW = new Date(2026, 4, 20, 9).getTime();

/**
 * A row as the editor saves it: local midnight of its day (most rows), or a
 * real time of day when `hour` is given. `updatedAt` staggers so the default
 * order (most recently updated first) is `rank` ascending.
 */
function transaction(
  id: string,
  dayOfMonth: number,
  {
    hour = 0,
    rank = 0,
    dayOrder = null,
  }: { hour?: number; rank?: number; dayOrder?: number | null } = {},
): TransactionWithRelations {
  const date = new Date(2026, 4, dayOfMonth, hour).toISOString();
  const updatedAt = new Date(NOW - 60_000 * (rank + 1)).toISOString();
  return {
    id,
    date,
    amount: 1,
    createdAt: updatedAt,
    updatedAt,
    dayOrder,
  } as TransactionWithRelations;
}

function day(dayOfMonth: number): ReorderRow {
  const dayKey = `2026-05-${String(dayOfMonth).padStart(2, '0')}`;
  return { kind: 'day', id: `day-${dayOfMonth}`, dayKey };
}

function row(tx: TransactionWithRelations): ReorderRow {
  return { kind: 'transaction', id: tx.id, transaction: tx };
}

/** Apply the updates the way the repository does (every write bumps updatedAt). */
function applyUpdates(
  rows: ReorderRow[],
  updates: ReorderUpdate[],
  writtenAt = NOW,
): TransactionWithRelations[] {
  const updateById = new Map(updates.map((update) => [update.id, update]));
  return rows.flatMap((entry) => {
    if (entry.kind !== 'transaction') return [];
    const update = updateById.get(entry.id);
    if (!update) return [entry.transaction];
    const { id: _id, ...input } = update;
    return [{ ...entry.transaction, ...input, updatedAt: new Date(writtenAt).toISOString() }];
  });
}

function order(transactions: TransactionWithRelations[]): string[] {
  return sortTransactions(transactions, 'date_desc').map((tx) => tx.id);
}

describe('saving a transaction drag', () => {
  it('reorders date-only rows by key alone, leaving the date untouched', () => {
    const first = transaction('first', 13, { rank: 0 });
    const second = transaction('second', 13, { rank: 1 });
    const third = transaction('third', 13, { rank: 2 });
    const dropped = [day(13), row(third), row(first), row(second)];

    const updates = reorderUpdatesForDrag(dropped, 'third', NOW);

    expect(updates).toEqual([{ id: 'third', dayOrder: NOW }]);
    expect(order(applyUpdates(dropped, updates))).toEqual(['third', 'first', 'second']);
  });

  it('still puts a record added later on top of a row dragged to the top', () => {
    const first = transaction('first', 13, { rank: 0 });
    const second = transaction('second', 13, { rank: 1 });
    const dropped = [day(13), row(second), row(first)];
    const saved = applyUpdates(dropped, reorderUpdatesForDrag(dropped, 'second', NOW));

    // Added a minute later from the editor: local midnight, fresh updatedAt.
    const added = {
      ...transaction('added', 13),
      updatedAt: new Date(NOW + 60_000).toISOString(),
    };

    expect(order([...saved, added])).toEqual(['added', 'second', 'first']);
  });

  it('slots a row between two date-only neighbours without writing them', () => {
    const first = transaction('first', 13, { rank: 0 });
    const second = transaction('second', 13, { rank: 1 });
    const third = transaction('third', 13, { rank: 2 });
    const dropped = [day(13), row(first), row(third), row(second)];

    const updates = reorderUpdatesForDrag(dropped, 'third', NOW);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: 'third' });
    expect(updates[0]).not.toHaveProperty('date');
    expect(order(applyUpdates(dropped, updates))).toEqual(['first', 'third', 'second']);
  });

  it('moves a date-only row to another day at midnight, not a made-up time', () => {
    const newer = transaction('newer', 14, { rank: 0 });
    const older = transaction('older', 14, { rank: 1 });
    const moved = transaction('moved', 13, { rank: 2 });
    const dropped = [day(14), row(newer), row(moved), row(older), day(13)];

    const updates = reorderUpdatesForDrag(dropped, 'moved', NOW);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.date).toBe(newer.date);
    expect(dayKeyFromIsoLocal(updates[0]!.date!)).toBe('2026-05-14');
    expect(order(applyUpdates(dropped, updates))).toEqual(['newer', 'moved', 'older']);
  });

  it('keeps a timed row’s own time when it already fits between its new neighbours', () => {
    const evening = transaction('evening', 14, { hour: 18 });
    const morning = transaction('morning', 14, { hour: 8 });
    const noon = transaction('noon', 13, { hour: 12 });
    const dropped = [day(14), row(evening), row(noon), row(morning), day(13)];

    const updates = reorderUpdatesForDrag(dropped, 'noon', NOW);

    expect(updates).toEqual([{ id: 'noon', date: new Date(2026, 4, 14, 12).toISOString() }]);
    expect(order(applyUpdates(dropped, updates))).toEqual(['evening', 'noon', 'morning']);
  });

  it('lowers a timed row to midnight to sit below date-only rows', () => {
    const first = transaction('first', 13, { rank: 0 });
    const timed = transaction('timed', 13, { hour: 21 });
    const dropped = [day(13), row(first), row(timed)];

    const updates = reorderUpdatesForDrag(dropped, 'timed', NOW);

    expect(updates[0]?.date).toBe(first.date);
    expect(order(applyUpdates(dropped, updates))).toEqual(['first', 'timed']);
  });

  it('raises a date-only row only as far as the timed row it is dropped above', () => {
    const timed = transaction('timed', 13, { hour: 14 });
    const plain = transaction('plain', 13, { rank: 0 });
    const dropped = [day(13), row(plain), row(timed)];

    const updates = reorderUpdatesForDrag(dropped, 'plain', NOW);

    expect(updates[0]?.date).toBe(timed.date);
    expect(order(applyUpdates(dropped, updates))).toEqual(['plain', 'timed']);
  });

  it('renumbers only the tied rows when their keys are too close to split', () => {
    const top = transaction('top', 13, { dayOrder: 1000 });
    // The very next double below 1000: no number fits between the two.
    const next = transaction('next', 13, { dayOrder: 1000 - 2 ** -43 });
    const moved = transaction('moved', 13, { rank: 5 });
    const timed = transaction('timed', 13, { hour: 20 });
    const dropped = [day(13), row(timed), row(top), row(moved), row(next)];

    const updates = reorderUpdatesForDrag(dropped, 'moved', NOW);

    expect(updates.map((update) => update.id).sort()).toEqual(['moved', 'next', 'top']);
    expect(order(applyUpdates(dropped, updates))).toEqual(['timed', 'top', 'moved', 'next']);
  });

  it('places a row dropped above the first header at the top of that day', () => {
    const first = transaction('first', 13, { rank: 0 });
    const moved = transaction('moved', 12, { rank: 1 });
    const dropped = [row(moved), day(13), row(first), day(12)];

    const updates = reorderUpdatesForDrag(dropped, 'moved', NOW);

    expect(dayKeyFromIsoLocal(updates[0]!.date!)).toBe('2026-05-13');
    expect(order(applyUpdates(dropped, updates))).toEqual(['moved', 'first']);
  });

  it('does not write a lone row dropped above its own header', () => {
    const moved = transaction('moved', 13, { hour: 12 });

    expect(reorderUpdatesForDrag([row(moved), day(13)], 'moved', NOW)).toEqual([]);
  });

  it('does not rewrite a key that already sits between its neighbours', () => {
    const top = transaction('top', 13, { dayOrder: 3000 });
    const moved = transaction('moved', 13, { dayOrder: 2000 });
    const bottom = transaction('bottom', 13, { dayOrder: 1000 });

    expect(
      reorderUpdatesForDrag([day(13), row(top), row(moved), row(bottom)], 'moved', NOW),
    ).toEqual([]);
  });

  it('ties quick entry’s date-only rows with the editor’s midnight rows', () => {
    // Quick entry saves `YYYY-MM-DD`; the editor saves local midnight as ISO.
    const quick = { ...transaction('quick', 13, { rank: 0 }), date: '2026-05-13' };
    const editor = transaction('editor', 13, { rank: 1 });
    const dropped = [day(13), row(editor), row(quick)];

    const updates = reorderUpdatesForDrag(dropped, 'editor', NOW);

    expect(updates).toEqual([{ id: 'editor', dayOrder: NOW }]);
    expect(order(applyUpdates(dropped, updates))).toEqual(['editor', 'quick']);
  });

  it('keeps a date-only row date-only when it moves to another day', () => {
    const newer = { ...transaction('newer', 14, { rank: 0 }), date: '2026-05-14' };
    const moved = { ...transaction('moved', 13, { rank: 1 }), date: '2026-05-13' };
    const dropped = [day(14), row(moved), row(newer), day(13)];

    const updates = reorderUpdatesForDrag(dropped, 'moved', NOW);

    expect(updates).toEqual([{ id: 'moved', date: '2026-05-14', dayOrder: NOW }]);
  });
});
