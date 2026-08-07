import type { NotificationPreferences } from '~/types';

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

/** Deep link a review reminder opens when tapped. */
export function reviewNotificationUrl(zoom: 'week' | 'month'): string {
  return `money2time://insights?focus=review&zoom=${zoom}`;
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
  };
}
