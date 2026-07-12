// Metering windows for the scan quota. The rate limiter is interval-agnostic:
// a tier declares a unit ('day' | 'week' | 'month' | 'year'), and these helpers
// turn "now" into the window's start and end as epoch-ms.
//
// scan_usage stores the window as two typed columns — `interval_unit` and
// `window_start` (see the D1 schema) — rather than an encoded string. A row is
// identified by (app_user_id, interval_unit, window_start); `end` (stored as
// expires_at) drives pruning. Windows are UTC and calendar-aligned; weeks start
// Monday. Adding a new cadence is a single case in each switch below.

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

const UNITS: readonly IntervalUnit[] = ['day', 'week', 'month', 'year'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an env-supplied unit, falling back to `fallback` when absent/invalid. */
export function toIntervalUnit(value: string | undefined, fallback: IntervalUnit = 'month'): IntervalUnit {
  return value && (UNITS as readonly string[]).includes(value) ? (value as IntervalUnit) : fallback;
}

/** Epoch-ms at 00:00 UTC on the Monday of `now`'s week. */
function startOfIsoWeekMs(now: Date): number {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7; // getUTCDay: 0=Sun..6=Sat
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday);
}

/** Epoch-ms at 00:00 UTC on the first instant of the window containing `now`. */
export function windowStart(unit: IntervalUnit, now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  switch (unit) {
    case 'day':
      return Date.UTC(year, month, now.getUTCDate());
    case 'week':
      return startOfIsoWeekMs(now);
    case 'month':
      return Date.UTC(year, month, 1);
    case 'year':
      return Date.UTC(year, 0, 1);
  }
}

/** Epoch-ms at the start of the NEXT window (when the counter resets / row prunes). */
export function windowEnd(unit: IntervalUnit, now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  switch (unit) {
    case 'day':
      return Date.UTC(year, month, now.getUTCDate() + 1);
    case 'week':
      return startOfIsoWeekMs(now) + 7 * DAY_MS;
    case 'month':
      return Date.UTC(year, month + 1, 1);
    case 'year':
      return Date.UTC(year + 1, 0, 1);
  }
}
