import type { TransactionWithRelations } from '~/types';
import {
  dateKeepingTimeOfDay,
  dayKeyFromIsoLocal,
  timeFromDateLocal,
  timeOfDayOnDay,
} from '~/utils/formatters';
import { transactionOrderKey } from '~/utils/transactionSorting';

export type ReorderRow =
  | { kind: 'day'; id: string; dayKey: string }
  | { kind: 'transaction'; id: string; transaction: TransactionWithRelations };

export interface ReorderUpdate {
  id: string;
  date?: string;
  dayOrder?: number;
}

type TransactionRow = Extract<ReorderRow, { kind: 'transaction' }>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function localDayBounds(dayKey: string): [number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (dayKeyFromIsoLocal(start.toISOString()) !== dayKey) return null;
  return [start.getTime(), new Date(year, month - 1, day + 1).getTime() - 1];
}

/**
 * Save a drag without inventing a time of day.
 *
 * Rows sort by day, then time, then order key (`dayOrder`, or `createdAt` for a
 * row nobody has dragged). Most rows are date-only, stored at local midnight,
 * so what a drag really sets is the key. An earlier version gave the dropped
 * row a time halfway to the end of the day instead, which put it above every
 * record added to that day afterwards.
 *
 * So the dropped row keeps its own time of day when that already falls between
 * its new neighbours. Otherwise it takes the nearest neighbour's time, and a
 * key between the keys of the neighbours it now ties with. The top of a day
 * gets `now`, which is still below anything added later. Only the moved row is
 * written, unless its neighbours' keys are too close to split, in which case
 * the rows sharing its time are renumbered in their visible order.
 */
export function reorderUpdatesForDrag(
  reorderedRows: readonly ReorderRow[],
  movedId: string,
  now: number = Date.now(),
): ReorderUpdate[] {
  const movedIndex = reorderedRows.findIndex(
    (row) => row.kind === 'transaction' && row.id === movedId,
  );
  if (movedIndex < 0) return [];
  const moved = reorderedRows[movedIndex];
  if (moved.kind !== 'transaction') return [];

  let headerIndex = movedIndex;
  while (headerIndex >= 0 && reorderedRows[headerIndex]?.kind !== 'day') headerIndex -= 1;
  if (headerIndex < 0) {
    headerIndex = reorderedRows.findIndex((row) => row.kind === 'day');
  }
  const header = reorderedRows[headerIndex];
  const targetDay =
    header?.kind === 'day' ? header.dayKey : dayKeyFromIsoLocal(moved.transaction.date);
  const bounds = localDayBounds(targetDay);
  if (!bounds) return [];
  const [dayStart, dayEnd] = bounds;

  const sectionStart = headerIndex < 0 || movedIndex < headerIndex ? 0 : headerIndex + 1;
  let sectionEnd = reorderedRows.length;
  for (
    let index = Math.max(movedIndex + 1, headerIndex + 1);
    index < reorderedRows.length;
    index += 1
  ) {
    if (reorderedRows[index]?.kind === 'day') {
      sectionEnd = index;
      break;
    }
  }
  const section = reorderedRows
    .slice(sectionStart, sectionEnd)
    .filter((row): row is TransactionRow => row.kind === 'transaction');
  const position = section.findIndex((row) => row.id === movedId);
  if (position < 0) return [];
  const before = section[position - 1]?.transaction;
  const after = section[position + 1]?.transaction;

  // Time: its own, clamped between the neighbours'. Taking a neighbour's time
  // reuses its stored value as is, so the two tie and the key decides.
  const ownTime = timeOfDayOnDay(moved.transaction.date, targetDay);
  const beforeTime = before ? timeFromDateLocal(before.date) : dayEnd;
  const afterTime = after ? timeFromDateLocal(after.date) : dayStart;
  let date: string;
  if (ownTime > beforeTime && before) {
    date = before.date;
  } else if (ownTime < afterTime && after) {
    date = after.date;
  } else if (ownTime === dayStart && DATE_ONLY.test(moved.transaction.date)) {
    // A date-only row stays date-only on its new day.
    date = targetDay;
  } else {
    date = new Date(Math.min(Math.max(ownTime, dayStart), dayEnd)).toISOString();
  }
  // A bare day reaching an update means "keep this row's own time" (see
  // `dateKeepingTimeOfDay`), so a timed row borrowing a date-only neighbour's
  // time gets that instant written out in full instead.
  if (DATE_ONLY.test(date) && !DATE_ONLY.test(moved.transaction.date)) {
    date = new Date(timeFromDateLocal(date)).toISOString();
  }
  const time = timeFromDateLocal(date);
  const sameInstant = timeFromDateLocal(moved.transaction.date) === time;
  const dateUpdate = sameInstant ? {} : { date };

  // Key: only matters against neighbours that now share its time.
  const tiesBefore = before != null && beforeTime === time;
  const tiesAfter = after != null && afterTime === time;
  if (!tiesBefore && !tiesAfter) {
    return 'date' in dateUpdate ? [{ id: movedId, ...dateUpdate }] : [];
  }
  const upper = tiesBefore && before ? transactionOrderKey(before) : Infinity;
  const lower = tiesAfter && after ? transactionOrderKey(after) : -Infinity;
  const current = moved.transaction.dayOrder;
  if (current != null && current > lower && current < upper) {
    return 'date' in dateUpdate ? [{ id: movedId, ...dateUpdate }] : [];
  }

  let dayOrder: number | null;
  if (upper === Infinity) {
    dayOrder = Math.max(lower + 1, now);
  } else if (lower === -Infinity) {
    dayOrder = upper - 1;
  } else {
    const middle = (lower + upper) / 2;
    dayOrder = middle > lower && middle < upper ? middle : null;
  }
  if (dayOrder != null) return [{ id: movedId, ...dateUpdate, dayOrder }];

  // The neighbours' keys are too close to split: renumber the rows that share
  // this time, in their visible order, one millisecond apart below `now`.
  const tied = section.filter(
    (row) => row.id === movedId || timeFromDateLocal(row.transaction.date) === time,
  );
  return tied.flatMap((row, index) => {
    const nextOrder = now - index;
    if (row.id === movedId) return [{ id: row.id, ...dateUpdate, dayOrder: nextOrder }];
    return row.transaction.dayOrder === nextOrder ? [] : [{ id: row.id, dayOrder: nextOrder }];
  });
}

/**
 * The transactions as they read once `updates` are saved, for a list that
 * shows a drop before the app-wide update reaches it. A date goes through the
 * same `dateKeepingTimeOfDay` the save applies, so the list and the saved rows
 * agree on the order. Updates apply in order, as saves made one after another
 * would. Unchanged rows keep their identity; nothing is re-sorted.
 */
export function applyReorderUpdates<T extends TransactionWithRelations>(
  transactions: readonly T[],
  updates: readonly ReorderUpdate[],
): T[] {
  const byId = new Map<string, T>();
  for (const update of updates) {
    const current = byId.get(update.id) ?? transactions.find((row) => row.id === update.id);
    if (!current) continue;
    const next = { ...current };
    if (update.date !== undefined) next.date = dateKeepingTimeOfDay(update.date, current.date);
    if (update.dayOrder !== undefined) next.dayOrder = update.dayOrder;
    byId.set(update.id, next);
  }
  return transactions.map((transaction) => byId.get(transaction.id) ?? transaction);
}
