import {
  DEFAULT_NOTIFICATION_PREFS,
  normalizeNotificationPrefs,
  reviewNotificationUrl,
} from '~/services/notifications.shared';

describe('DEFAULT_NOTIFICATION_PREFS', () => {
  it('has both review reminders on by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.weeklyReview.enabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.monthlyReview.enabled).toBe(true);
  });
});

describe('normalizeNotificationPrefs', () => {
  it('falls back to defaults for junk input', () => {
    expect(normalizeNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs('nope')).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs(42)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs({})).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('keeps stored values it can validate', () => {
    const prefs = normalizeNotificationPrefs({
      dailyCheckin: { enabled: true, hour: 7, minute: 30 },
      recurringAlert: { enabled: false },
      weeklyReview: { enabled: false, hour: 18, minute: 0, displayMode: 'time' },
      monthlyReview: { enabled: true, hour: 9, minute: 30, displayMode: 'money' },
    });
    expect(prefs.dailyCheckin).toEqual({ enabled: true, hour: 7, minute: 30 });
    expect(prefs.recurringAlert.enabled).toBe(false);
    expect(prefs.weeklyReview).toEqual({
      enabled: false,
      hour: 18,
      minute: 0,
      displayMode: 'time',
    });
    expect(prefs.monthlyReview.hour).toBe(9);
  });

  it('rejects out-of-range and wrongly-typed fields individually', () => {
    const prefs = normalizeNotificationPrefs({
      dailyCheckin: { enabled: 'yes', hour: 99, minute: -1 },
      weeklyReview: { enabled: true, hour: 8, minute: 15, displayMode: 'hours' },
    });
    // Bad fields fall back; the good ones on the same object survive.
    expect(prefs.dailyCheckin).toEqual(DEFAULT_NOTIFICATION_PREFS.dailyCheckin);
    expect(prefs.weeklyReview).toEqual({
      enabled: true,
      hour: 8,
      minute: 15,
      displayMode: 'money',
    });
  });

  describe('upgrading from the pre-review "weekly summary" blob', () => {
    const legacy = {
      dailyCheckin: { enabled: true, hour: 21, minute: 0 },
      recurringAlert: { enabled: true },
      weeklySummary: {
        enabled: false,
        dayOfWeek: 3,
        hour: 19,
        minute: 30,
        displayMode: 'time',
      },
    };

    it('carries the old time and display mode onto the weekly review', () => {
      const prefs = normalizeNotificationPrefs(legacy);
      expect(prefs.weeklyReview.hour).toBe(19);
      expect(prefs.weeklyReview.minute).toBe(30);
      expect(prefs.weeklyReview.displayMode).toBe('time');
    });

    it("does not inherit the old summary's disabled state", () => {
      // The old summary defaulted to off and had no prominent prompt, so a
      // stored `false` is "never touched it" rather than an opt-out. Review
      // reminders are on by default for everyone.
      expect(normalizeNotificationPrefs(legacy).weeklyReview.enabled).toBe(true);
    });

    it('gives the monthly review plain defaults', () => {
      expect(normalizeNotificationPrefs(legacy).monthlyReview).toEqual(
        DEFAULT_NOTIFICATION_PREFS.monthlyReview,
      );
    });

    it('drops the retired dayOfWeek rather than leaking it through', () => {
      expect(normalizeNotificationPrefs(legacy).weeklyReview).not.toHaveProperty('dayOfWeek');
    });

    it('prefers a real weeklyReview block when both are present', () => {
      const prefs = normalizeNotificationPrefs({
        ...legacy,
        weeklyReview: { enabled: false, hour: 7, minute: 0, displayMode: 'money' },
      });
      expect(prefs.weeklyReview).toEqual({
        enabled: false,
        hour: 7,
        minute: 0,
        displayMode: 'money',
      });
    });
  });

  it('is a fixpoint, so a re-read of its own output is stable', () => {
    const once = normalizeNotificationPrefs({ weeklySummary: { hour: 19, minute: 30 } });
    expect(normalizeNotificationPrefs(once)).toEqual(once);
  });
});

describe('reviewNotificationUrl', () => {
  it('deep links into the review insight at the right zoom', () => {
    expect(reviewNotificationUrl('week')).toBe('money2time://insights?focus=review&zoom=week');
    expect(reviewNotificationUrl('month')).toBe('money2time://insights?focus=review&zoom=month');
  });
});
