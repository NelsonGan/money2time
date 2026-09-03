import {
  DEFAULT_LIVE_EARNINGS_SCHEDULE,
  normalizeLiveEarningsSchedule,
} from '~/features/widgets/lib/liveEarningsSchedule';
import type { NotificationPreferences, Weekday } from '~/types';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  dailyCheckin: {
    enabled: false,
    hour: 20,
    minute: 0,
  },
  recurringAlert: {
    enabled: true,
  },
  weeklyReview: {
    enabled: true,
    hour: 10,
    minute: 0,
  },
  monthlyReview: {
    enabled: true,
    hour: 10,
    minute: 0,
  },
  liveEarningsStart: normalizeLiveEarningsSchedule(DEFAULT_LIVE_EARNINGS_SCHEDULE),
};

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// Notification identifiers for scheduling
export const DAILY_CHECKIN_ID = 'm2t-daily-checkin';
export const WEEKLY_REVIEW_ID = 'm2t-weekly-review';
export const MONTHLY_REVIEW_ID = 'm2t-monthly-review';
/**
 * Retired identifier of the old "weekly summary" reminder, which the weekly
 * review replaced. Still cancelled on every sync so an install that scheduled
 * one before upgrading does not keep firing it forever.
 */
export const LEGACY_WEEKLY_SUMMARY_ID = 'm2t-weekly-summary';

/**
 * One identifier per weekday, because expo-notifications' WEEKLY trigger fires
 * on a single weekday: a Mon/Wed/Fri schedule is three separate weekly
 * notifications, not one.
 */
export function liveEarningsStartId(weekday: Weekday): string {
  return `m2t-live-earnings-${weekday}`;
}

export const LIVE_EARNINGS_START_IDS: string[] = [0, 1, 2, 3, 4, 5, 6].map((day) =>
  liveEarningsStartId(day as Weekday),
);

/**
 * Deep link the auto-start reminder opens. `start=1` is what tells the app to
 * begin the session rather than only showing the screen, so opening the screen
 * by any other route never starts a clock the user did not ask for.
 */
export function liveEarningsStartUrl(hours: number): string {
  return `money2time://live-earnings?start=1&hours=${hours}`;
}

/** Deep link a review reminder opens when tapped. */
export function reviewNotificationUrl(zoom: 'week' | 'month'): string {
  return `money2time://insights?focus=review&zoom=${zoom}`;
}

/**
 * The last day of the month an OS monthly trigger may be scheduled on.
 *
 * expo-notifications validates a MONTHLY trigger's `day` against the CURRENT
 * calendar month, so day 31 throws a RangeError in any 30-day month and 29/30
 * throw in February (Sentry MONEY2TIME-3P). Even if it were accepted, the
 * underlying OS trigger simply would not fire in a month that short.
 */
export const MAX_MONTHLY_REMINDER_DAY = 28;

/**
 * The day of the month the monthly review reminder actually fires on, given
 * the default day of the user's month cycle (1..31).
 *
 * Days 29..31 roll to the 1st rather than clamping down to the 28th. The
 * reminder exists to recap the month that has just closed, and a cycle
 * starting on the 29th, 30th or 31st closes at the very end of the calendar
 * month, so the 28th would arrive up to three days BEFORE the period it
 * invites the user to review. The 1st is one to three days after the cycle
 * rolls, which is the same side of the boundary every other day lands on.
 */
export function monthlyReminderDay(firstDayOfMonth: number | null | undefined): number {
  if (typeof firstDayOfMonth !== 'number' || !Number.isInteger(firstDayOfMonth)) return 1;
  if (firstDayOfMonth < 1 || firstDayOfMonth > MAX_MONTHLY_REMINDER_DAY) return 1;
  return firstDayOfMonth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asIntInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return rounded < min || rounded > max ? fallback : rounded;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads a stored notification-prefs blob into a fully-populated object.
 *
 * The blob is schemaless JSON written by older builds, so every field is
 * validated rather than trusted. Installs that predate the review reminders
 * carry a `weeklySummary` block instead: its time-of-day choice is carried
 * across to `weeklyReview`, but not its `enabled` flag —
 * review reminders are on by default, and the old summary defaulted to off, so
 * inheriting that would silently opt everyone out of the new feature.
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPreferences {
  if (!isRecord(raw)) return DEFAULT_NOTIFICATION_PREFS;

  const defaults = DEFAULT_NOTIFICATION_PREFS;
  const dailyCheckin = isRecord(raw.dailyCheckin) ? raw.dailyCheckin : {};
  const recurringAlert = isRecord(raw.recurringAlert) ? raw.recurringAlert : {};
  const legacyWeekly = isRecord(raw.weeklySummary) ? raw.weeklySummary : null;
  const weeklyReview = isRecord(raw.weeklyReview) ? raw.weeklyReview : (legacyWeekly ?? {});
  const monthlyReview = isRecord(raw.monthlyReview) ? raw.monthlyReview : {};

  return {
    dailyCheckin: {
      enabled: asBoolean(dailyCheckin.enabled, defaults.dailyCheckin.enabled),
      hour: asIntInRange(dailyCheckin.hour, 0, 23, defaults.dailyCheckin.hour),
      minute: asIntInRange(dailyCheckin.minute, 0, 59, defaults.dailyCheckin.minute),
    },
    recurringAlert: {
      enabled: asBoolean(recurringAlert.enabled, defaults.recurringAlert.enabled),
    },
    weeklyReview: {
      // A legacy blob has no `weeklyReview.enabled`; fall through to the default.
      enabled: asBoolean(
        isRecord(raw.weeklyReview) ? raw.weeklyReview.enabled : undefined,
        defaults.weeklyReview.enabled,
      ),
      hour: asIntInRange(weeklyReview.hour, 0, 23, defaults.weeklyReview.hour),
      minute: asIntInRange(weeklyReview.minute, 0, 59, defaults.weeklyReview.minute),
    },
    monthlyReview: {
      enabled: asBoolean(monthlyReview.enabled, defaults.monthlyReview.enabled),
      hour: asIntInRange(monthlyReview.hour, 0, 23, defaults.monthlyReview.hour),
      minute: asIntInRange(monthlyReview.minute, 0, 59, defaults.monthlyReview.minute),
    },
    // Absent on every blob written before the auto-start schedule shipped,
    // which normalizes to the off-by-default schedule.
    liveEarningsStart: normalizeLiveEarningsSchedule(raw.liveEarningsStart),
  };
}
