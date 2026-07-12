// Metering intervals for the scan quota. The rate limiter is interval-agnostic:
// a tier just declares a unit ('day' | 'week' | 'month' | 'year'), and these
// helpers turn "now" into a stable period key + the epoch-ms at which that
// window resets. Adding a new cadence (e.g. 'quarter') is a single case here —
// no schema change, since scan_usage.period stores whatever string we return.
//
// The period key is prefixed with the unit (e.g. `month:2026-07`) so it is
// self-describing and so changing a tier's interval never collides an old
// window with a new one. Windows are UTC and calendar-aligned; weeks start
// Monday.

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

const UNITS: readonly IntervalUnit[] = ['day', 'week', 'month', 'year'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an env-supplied unit, falling back to `fallback` when absent/invalid. */
export function toIntervalUnit(value: string | undefined, fallback: IntervalUnit = 'month'): IntervalUnit {
  return value && (UNITS as readonly string[]).includes(value) ? (value as IntervalUnit) : fallback;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

/** Epoch-ms at 00:00 UTC on the Monday of `now`'s week. */
function startOfIsoWeekMs(now: Date): number {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7; // getUTCDay: 0=Sun..6=Sat
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday);
}

/** A stable, unit-prefixed key for the window containing `now`. */
export function periodKey(unit: IntervalUnit, now: Date): string {
  const year = now.getUTCFullYear();
  switch (unit) {
    case 'day':
      return `day:${ymd(year, now.getUTCMonth() + 1, now.getUTCDate())}`;
    case 'week': {
      const monday = new Date(startOfIsoWeekMs(now));
      return `week:${ymd(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate())}`;
    }
    case 'month':
      return `month:${year}-${pad(now.getUTCMonth() + 1)}`;
    case 'year':
      return `year:${year}`;
  }
}

/** Epoch-ms at the start of the next window (when the counter resets / row prunes). */
export function periodExpiry(unit: IntervalUnit, now: Date): number {
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
