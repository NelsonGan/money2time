/**
 * The auto-start schedule behind live earnings: which weekdays, at what time,
 * and for how long.
 *
 * `Activity.request()` is foreground-only, so nothing the app schedules
 * locally can put a card on the Lock Screen by itself. What can is an APNs
 * **push-to-start** (iOS 17.2+): the device hands over a token for the
 * activity *type*, the app registers it with the shift, and the live-earnings
 * Worker sends the start push at the right local minute with the app not
 * running at all. `buildScheduleRegistration` below is what it registers.
 *
 * The local notification is still there as the fallback - iOS below 17.2, or a
 * device that has not been handed a token - and then the schedule is what it
 * always was: a reminder, and one tap starts the clock.
 *
 * Kept pure and free of Date.now() so the screen, the notification sync, the
 * push registration and the tests all read the same rules.
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
  // A scheduled shift is a working day, so it defaults to one rather than to
  // the half-day a hand-started session opens on.
  shiftHours: 8,
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
    // Falls back to `hours` before the default, not straight to it: until this
    // field existed the two were one value, so an install upgrading into it
    // keeps the shift length it was already scheduling rather than being moved
    // to a full day it never asked for.
    shiftHours: clampSessionHours(
      typeof record.shiftHours === 'number'
        ? record.shiftHours
        : typeof record.hours === 'number'
          ? record.hours
          : defaults.shiftHours,
    ),
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

const MINUTES_PER_DAY = 24 * 60;

/**
 * The wall-clock time a scheduled shift ends, wrapping past midnight.
 *
 * Deliberately minute arithmetic rather than a `Date`: a night shift ending at
 * 02:00 is the same 02:00 whichever calendar day it lands on, and building a
 * date to add hours to would drag a daylight-saving change into a label that
 * has nothing to do with one.
 */
export function scheduleEndClock(schedule: LiveEarningsSchedule): {
  hour: number;
  minute: number;
} {
  const total =
    (schedule.hour * 60 + schedule.minute + clampSessionHours(schedule.shiftHours) * 60) %
    MINUTES_PER_DAY;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export interface ScheduleRegistrationCopy {
  /** "You've earned this much today" - the card's headline. */
  titleText: string;
  /** "RM45.00/hr". */
  rateText: string;
  /** "Ends 5:00 PM". */
  endsText: string;
  /** "of RM360.00". */
  totalText: string;
  /** Accessibility label for the card's refresh button. */
  refreshText: string;
  /** Title and body of the alert a start push must carry. */
  alertTitle: string;
  alertBody: string;
}

export interface ScheduleRegistrationInput {
  schedule: LiveEarningsSchedule;
  hourlyRate: number;
  currencySymbol: string;
  timeZone: string;
  pushToStartToken: string;
  accent: { accentLightHex: number; accentDarkHex: number };
  copy: ScheduleRegistrationCopy;
  formatAmount: (value: number) => string;
}

export interface ScheduleRegistration extends ScheduleRegistrationCopy {
  pushToStartToken: string;
  timeZone: string;
  days: Weekday[];
  hour: number;
  minute: number;
  durationMinutes: number;
  hourlyRate: number;
  currencySymbol: string;
  zeroText: string;
  accentLightHex: number;
  accentDarkHex: number;
}

/**
 * Everything the server needs to raise the card on its own: when, for how
 * long, and every string it will show.
 *
 * The copy is rendered here rather than on the server because the server has
 * no i18n catalog and no view of the user's currency - the same reason the
 * widget's timeline carries formatted labels. It can all be rendered in
 * advance because a scheduled shift is fixed in advance: the start time, the
 * length and the rate are already known, so the only thing left to happen at
 * push time is the push.
 */
export function buildScheduleRegistration(input: ScheduleRegistrationInput): ScheduleRegistration {
  const { schedule, hourlyRate, currencySymbol, formatAmount } = input;
  const hours = clampSessionHours(schedule.shiftHours);
  return {
    pushToStartToken: input.pushToStartToken,
    timeZone: input.timeZone,
    days: normalizeScheduleDays(schedule.days),
    hour: schedule.hour,
    minute: schedule.minute,
    durationMinutes: hours * 60,
    hourlyRate,
    currencySymbol,
    ...input.copy,
    // The card opens at zero: a scheduled shift starts when it starts, so
    // there is never anything already accrued to show.
    zeroText: formatAmount(0),
    ...input.accent,
  };
}

/** What a shift is worth end to end, for the card's "of {total}" label. */
export function scheduledSessionTotal(schedule: LiveEarningsSchedule, hourlyRate: number): number {
  return clampSessionHours(schedule.shiftHours) * hourlyRate;
}
