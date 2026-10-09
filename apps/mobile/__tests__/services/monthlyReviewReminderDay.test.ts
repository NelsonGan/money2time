import {
  reviewReminderDayLabel,
  reviewReminderStatus,
} from '~/features/settings/screens/notificationCopy';
import { MAX_MONTHLY_REMINDER_DAY, monthlyReminderDay } from '~/services/notifications.shared';
import type { UserSettings } from '~/types';
import { daysInMonth, financialMonthRange } from '~/utils/financialMonth';

/**
 * Regression guard for Sentry MONEY2TIME-3P.
 *
 * `settings.firstDayOfMonth` goes up to 31 (a month cycle can start on the last
 * day), but expo-notifications validates a MONTHLY trigger's `day` against the
 * CURRENT calendar month and throws a RangeError when it does not fit. Passing
 * the raw setting therefore threw in every 30-day month, which both crashed the
 * sync and left the monthly review reminder unscheduled.
 */
describe('monthlyReminderDay', () => {
  it('passes days that exist in every month straight through', () => {
    for (let day = 1; day <= MAX_MONTHLY_REMINDER_DAY; day += 1) {
      expect(monthlyReminderDay(day)).toBe(day);
    }
  });

  it('rolls days 29..31 to the 1st', () => {
    expect(monthlyReminderDay(29)).toBe(1);
    expect(monthlyReminderDay(30)).toBe(1);
    expect(monthlyReminderDay(31)).toBe(1);
  });

  it('falls back to the 1st for values outside 1..31 and for junk', () => {
    expect(monthlyReminderDay(0)).toBe(1);
    expect(monthlyReminderDay(-3)).toBe(1);
    expect(monthlyReminderDay(99)).toBe(1);
    expect(monthlyReminderDay(2.5)).toBe(1);
    expect(monthlyReminderDay(NaN)).toBe(1);
    expect(monthlyReminderDay(null)).toBe(1);
    expect(monthlyReminderDay(undefined)).toBe(1);
  });

  /**
   * The invariant expo-notifications actually enforces: whatever month the app
   * happens to be opened in, the scheduled day has to fit inside it. February
   * of a non-leap year is the tightest case.
   */
  it('produces a day that fits in every calendar month, leap year or not', () => {
    for (let day = 1; day <= 31; day += 1) {
      const scheduled = monthlyReminderDay(day);
      for (let month = 1; month <= 12; month += 1) {
        expect(scheduled).toBeLessThanOrEqual(daysInMonth(2027, month));
        expect(scheduled).toBeLessThanOrEqual(daysInMonth(2028, month));
        expect(scheduled).toBeGreaterThanOrEqual(1);
      }
    }
  });

  /**
   * Why 29..31 roll UP to the 1st instead of being clamped down to the 28th:
   * the reminder recaps the month that has just closed, and a cycle starting
   * that late closes at the very end of the calendar month, so the 28th would
   * arrive before the period it invites the user to review.
   */
  it('fires after the financial month it recaps has closed', () => {
    for (let defaultDay = 1; defaultDay <= 31; defaultDay += 1) {
      const scheduled = monthlyReminderDay(defaultDay);
      // The financial month labelled 2027-01, whichever days it spans.
      const { endInclusive: closedOn } = financialMonthRange('2027-01', defaultDay);
      // The first reminder on or after that close.
      const reminder = new Date(closedOn.getFullYear(), closedOn.getMonth(), scheduled);
      if (reminder <= closedOn) {
        reminder.setMonth(reminder.getMonth() + 1);
      }
      const daysLate = Math.round((reminder.getTime() - closedOn.getTime()) / 86_400_000);
      expect(daysLate).toBeGreaterThan(0);
      expect(daysLate).toBeLessThanOrEqual(4);
    }
  });
});

describe('review reminder copy', () => {
  const settingsWith = (
    firstDayOfMonth: number,
  ): Pick<UserSettings, 'weekStartsOn' | 'firstDayOfMonth'> => ({
    weekStartsOn: 1,
    firstDayOfMonth,
  });

  it('names the day the reminder really fires, not the raw cycle day', () => {
    expect(reviewReminderDayLabel('monthlyReview', settingsWith(31))).toBe('Day 1 of every month');
    expect(
      reviewReminderStatus('monthlyReview', settingsWith(31), { hour: 10, minute: 0 }),
    ).toContain('Day 1');
  });

  it('leaves an ordinary cycle day alone', () => {
    expect(reviewReminderDayLabel('monthlyReview', settingsWith(25))).toBe('Day 25 of every month');
  });
});
