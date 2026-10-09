// Metering windows for the scan quota. An interval is a unit
// ('day'|'week'|'month'|'year') with an optional count prefix ('100year'); these
// helpers turn "now" into the window's start/end as epoch-ms. scan_usage keys a
// row by (app_user_id, interval_unit, window_start) and prunes on end.
//
// count === 1 windows are UTC calendar-aligned (weeks start Monday). count > 1
// windows are anchored at the Unix epoch and floored to a multiple of `count`
// units, so '100year' is a single 1970–2070 window (lifetime) without adding a
// 'lifetime' unit. Multi-count rows store the base unit ('100year' → 'year').

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

export interface Interval {
  count: number;
  unit: IntervalUnit;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
// Epoch-ms of the Monday on or before the Unix epoch (1969-12-29) — anchors
// week windows so count = 1 keeps the ISO Monday alignment.
const EPOCH_MONDAY_MS = -3 * DAY_MS;

// Parse an env interval ('month', '100year', '2 weeks'); `fallback` when invalid.
export function toInterval(value: string | undefined, fallback: Interval): Interval {
  const match = value?.trim().match(/^(\d+)?\s*(day|week|month|year)s?$/i);
  if (!match) return fallback;
  const count = match[1] ? Number(match[1]) : 1;
  if (!Number.isInteger(count) || count < 1) return fallback;
  return { count, unit: match[2].toLowerCase() as IntervalUnit };
}

/** Human/log form: 'month' for count 1, '100year' otherwise. */
export function formatInterval({ count, unit }: Interval): string {
  return count === 1 ? unit : `${count}${unit}`;
}

/** Whole `unit`s elapsed at `now` since the epoch anchor. */
function unitsSinceEpoch(unit: IntervalUnit, now: Date): number {
  switch (unit) {
    case 'day':
      return Math.floor(now.getTime() / DAY_MS);
    case 'week':
      return Math.floor((now.getTime() - EPOCH_MONDAY_MS) / WEEK_MS);
    case 'month':
      return (now.getUTCFullYear() - 1970) * 12 + now.getUTCMonth();
    case 'year':
      return now.getUTCFullYear() - 1970;
  }
}

/** Epoch-ms at the start of the window beginning `index` `unit`s after the anchor. */
function unitIndexToMs(unit: IntervalUnit, index: number): number {
  switch (unit) {
    case 'day':
      return index * DAY_MS;
    case 'week':
      return EPOCH_MONDAY_MS + index * WEEK_MS;
    case 'month':
      return Date.UTC(1970 + Math.floor(index / 12), index % 12, 1);
    case 'year':
      return Date.UTC(1970 + index, 0, 1);
  }
}

/** Epoch-ms at the first instant of the window containing `now`. */
export function windowStart(interval: Interval, now: Date): number {
  const { count, unit } = interval;
  const index = Math.floor(unitsSinceEpoch(unit, now) / count) * count;
  return unitIndexToMs(unit, index);
}

/** Epoch-ms at the start of the NEXT window (when the counter resets / row prunes). */
export function windowEnd(interval: Interval, now: Date): number {
  const { count, unit } = interval;
  const index = Math.floor(unitsSinceEpoch(unit, now) / count) * count;
  return unitIndexToMs(unit, index + count);
}
