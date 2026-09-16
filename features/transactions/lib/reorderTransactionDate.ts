import type { TransactionWithRelations } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

export type ReorderRow =
  | { kind: 'day'; id: string; dayKey: string }
  | { kind: 'transaction'; id: string; transaction: TransactionWithRelations };

export interface ReorderDateUpdate {
  id: string;
  date: string;
}

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
 * Give the dropped transaction a timestamp between its new neighbours. The
 * ordinary date/time sort then restores the dragged order on every screen.
 * When existing rows have identical timestamps (older date-only entries),
 * there is no slot between them, so retime that one day in visual order.
 */
export function dateUpdatesForDrag(
  reorderedRows: readonly ReorderRow[],
  movedId: string,
): ReorderDateUpdate[] {
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
    .filter(
      (row): row is Extract<ReorderRow, { kind: 'transaction' }> => row.kind === 'transaction',
    );
  const position = section.findIndex((row) => row.id === movedId);
  if (position < 0) return [];
  const before = section[position - 1]?.transaction;
  const after = section[position + 1]?.transaction;
  const beforeTime = before ? new Date(before.date).getTime() : dayEnd + 1;
  const afterTime = after ? new Date(after.date).getTime() : dayStart - 1;
  const upper = Math.min(beforeTime, dayEnd + 1);
  const lower = Math.max(afterTime, dayStart - 1);

  if (upper - lower > 1) {
    // A lone row on another day keeps its original local time of day.
    const original = new Date(moved.transaction.date);
    const localTime = new Date(targetDay + 'T00:00:00');
    localTime.setHours(
      original.getHours(),
      original.getMinutes(),
      original.getSeconds(),
      original.getMilliseconds(),
    );
    const nextTime = before || after ? Math.floor((upper + lower) / 2) : localTime.getTime();
    const nextDate = new Date(nextTime).toISOString();
    return nextDate === moved.transaction.date ? [] : [{ id: movedId, date: nextDate }];
  }

  // A day with equal or tightly packed timestamps cannot fit the moved row
  // without touching neighbours. Spread only this day's rows across its local
  // day, keeping the visual order and avoiding a separate sort-order column.
  const span = dayEnd - dayStart;
  const step = Math.max(1, Math.floor(span / (section.length + 1)));
  return section.flatMap((row, index) => {
    const nextDate = new Date(dayEnd - step * (index + 1)).toISOString();
    return nextDate === row.transaction.date ? [] : [{ id: row.id, date: nextDate }];
  });
}
