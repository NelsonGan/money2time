/**
 * The auto-start schedule behind live earnings: which weekdays, at what time,
 * and for how long.
 *
 * iOS will not let an app start a Live Activity from the background —
 * `Activity.request()` is foreground-only, and nothing short of an APNs
 * push-to-start changes that. So a schedule here is a *reminder* schedule: at
 * the chosen time a local notification fires, and tapping it opens the app and
 * starts the clock. One tap, no server.
 *
 * Kept pure and free of Date.now() so the screen, the notification sync and the
 * tests all read the same rules.
 */

import type { LiveEarningsSchedule, Weekday } from '~/types';

import { clampSessionHours } from './liveEarnings';

/** Monday to Friday: the shape almost every shift-worker wants first. */
export const DEFAULT_SCHEDULE_DAYS: Weekday[] = [1, 2, 3, 4, 5];

export const DEFAULT_LIVE_EARNINGS_SCHEDULE: LiveEarningsSchedule = {
  enabled: false,
  days: DEFAULT_SCHEDULE_DAYS,
  hour: 9,
  minute: 0,
  // Matches the duration the screen has always defaulted to. The schedule is
  // where that choice is now stored, so an install upgrading into this feature
  // keeps the duration it had rather than jumping to a full shift.
  hours: 4,
};

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * Ascending and deduplicated, so two schedules with the same days compare equal.
 *
 * An explicitly empty array is preserved rather than replaced by the default:
 * it is what deselecting the last chip produces, and quietly re-selecting
 * Monday to Friday underneath the user would be worse than a schedule that
 * fires nowhere and says so. Only a *missing* or non-array value falls back.
 */
export function normalizeScheduleDays(value: unknown): Weekday[] {
  // A copy, never the module-level array itself: it is reachable from
  // DEFAULT_NOTIFICATION_PREFS, and one caller mutating it in place would
  // corrupt the default for every install from then on.
  if (!Array.isArray(value)) return [...DEFAULT_SCHEDULE_DAYS];
  const seen = new Set<Weekday>();
  for (const entry of value) {
    if (isWeekday(entry)) seen.add(entry);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Reads a stored blob into a fully-populated schedule. The blob is schemaless
 * JSON written by older builds, so every field is validated rather than
 * trusted.
 *
 * An enabled schedule with no days is a legitimate in-between state: the user
 * has the feature on and is picking days. It simply schedules nothing until a
 * day is chosen, and the screen says as much.
 */
export function normalizeLiveEarningsSchedule(raw: unknown): LiveEarningsSchedule {
  const defaults = DEFAULT_LIVE_EARNINGS_SCHEDULE;
  // A fresh object with a fresh day list, for the same reason as above: the
  // default is module-level and must never be handed out by reference.
  if (typeof raw !== 'object' || raw === null) {
    return { ...defaults, days: [...defaults.days] };
  }
  const record = raw as Record<string, unknown>;

  return {
    enabled: record.enabled === true,
    days: normalizeScheduleDays(record.days),
    hour: asIntInRange(record.hour, 0, 23, defaults.hour),
    minute: asIntInRange(record.minute, 0, 59, defaults.minute),
    hours: clampSessionHours(typeof record.hours === 'number' ? record.hours : defaults.hours),
  };
}

function asIntInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return rounded < min || rounded > max ? fallback : rounded;
}

export function toggleScheduleDay(days: Weekday[], day: Weekday): Weekday[] {
  const next = days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day];
  return next.sort((a, b) => a - b);
}

/**
 * Weekday numbers ordered from the user's first day of the week, so the day
 * chips read in the same order as the calendar grid.
 */
export function weekdaysFrom(weekStartsOn: number): Weekday[] {
  const start = isWeekday(weekStartsOn) ? weekStartsOn : 0;
  return Array.from({ length: 7 }, (_, index) => ((start + index) % 7) as Weekday);
}
