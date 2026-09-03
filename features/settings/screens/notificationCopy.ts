import { I18n } from '~/lib/i18n';
import { monthlyReminderDay } from '~/services/notifications.shared';
import type { UserSettings, WeekStartsOn } from '~/types';
import { formatTimeOfDay } from '~/utils/formatters';

/**
 * `notifications.days.*` runs Monday-first, while `weekStartsOn` uses the
 * `Date.getDay()` convention (0 = Sunday). Convert rather than re-index by hand
 * at each call site.
 */
const DAY_KEYS = [
  'notifications.days.monday',
  'notifications.days.tuesday',
  'notifications.days.wednesday',
  'notifications.days.thursday',
  'notifications.days.friday',
  'notifications.days.saturday',
  'notifications.days.sunday',
] as const;

export function weekdayName(weekStartsOn: WeekStartsOn): string {
  return I18n.t(DAY_KEYS[(weekStartsOn + 6) % 7]);
}

type ReviewKey = 'weeklyReview' | 'monthlyReview';

/**
 * When a review reminder fires. The day is derived from the user's week /
 * financial-month start rather than chosen per notification, so the period it
 * recaps has always just closed.
 *
 * The monthly day goes through `monthlyReminderDay` for the same reason the
 * trigger does: a cycle starting on the 29th, 30th or 31st is reminded on the
 * 1st, and the label has to name the day the notification really arrives.
 */
export function reviewReminderDayLabel(
  key: ReviewKey,
  settings: Pick<UserSettings, 'weekStartsOn' | 'firstDayOfMonth'>,
): string {
  if (key === 'weeklyReview') {
    return I18n.t('notifications.review.every_week_on', {
      day: weekdayName(settings.weekStartsOn),
    });
  }
  return I18n.t('notifications.review.every_month_on', {
    day: monthlyReminderDay(settings.firstDayOfMonth),
  });
}

/** One-line "Monday, 10:00" style status shown on the notifications list row. */
export function reviewReminderStatus(
  key: ReviewKey,
  settings: Pick<UserSettings, 'weekStartsOn' | 'firstDayOfMonth'>,
  time: { hour: number; minute: number },
): string {
  const day =
    key === 'weeklyReview'
      ? weekdayName(settings.weekStartsOn)
      : I18n.t('notifications.review.day_of_month_short', {
          day: monthlyReminderDay(settings.firstDayOfMonth),
        });
  return `${day} ${formatTimeOfDay(time.hour, time.minute)}`;
}
