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
      weeklyReview: { enabled: false, hour: 18, minute: 0 },
      monthlyReview: { enabled: true, hour: 9, minute: 30 },
    });
    expect(prefs.dailyCheckin).toEqual({ enabled: true, hour: 7, minute: 30 });
    expect(prefs.recurringAlert.enabled).toBe(false);
    expect(prefs.weeklyReview).toEqual({ enabled: false, hour: 18, minute: 0 });
    expect(prefs.monthlyReview.hour).toBe(9);
  });

  it('rejects out-of-range and wrongly-typed fields individually', () => {
    const prefs = normalizeNotificationPrefs({
      dailyCheckin: { enabled: 'yes', hour: 99, minute: -1 },
      weeklyReview: { enabled: true, hour: 8, minute: 15 },
    });
    // Bad fields fall back; the good ones on the same object survive.
    expect(prefs.dailyCheckin).toEqual(DEFAULT_NOTIFICATION_PREFS.dailyCheckin);
    expect(prefs.weeklyReview).toEqual({ enabled: true, hour: 8, minute: 15 });
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

    it('carries the old time of day onto the weekly review', () => {
      const prefs = normalizeNotificationPrefs(legacy);
      expect(prefs.weeklyReview.hour).toBe(19);
      expect(prefs.weeklyReview.minute).toBe(30);
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
        weeklyReview: { enabled: false, hour: 7, minute: 0 },
      });
      expect(prefs.weeklyReview).toEqual({ enabled: false, hour: 7, minute: 0 });
    });
  });

  it('is a fixpoint, so a re-read of its own output is stable', () => {
    const once = normalizeNotificationPrefs({ weeklySummary: { hour: 19, minute: 30 } });
    expect(normalizeNotificationPrefs(once)).toEqual(once);
  });
});

describe('the live-earnings auto-start block', () => {
  it('is off by default, so upgrading never starts scheduling reminders', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.liveEarningsStart.enabled).toBe(false);
  });

  it('is off on a fresh install, which has no stored blob at all', () => {
    expect(normalizeNotificationPrefs(undefined).liveEarningsStart.enabled).toBe(false);
    expect(normalizeNotificationPrefs(null).liveEarningsStart.enabled).toBe(false);
    expect(normalizeNotificationPrefs({}).liveEarningsStart.enabled).toBe(false);
  });

  it('stays off unless `enabled` is the boolean true, never a truthy value', () => {
    for (const value of ['true', 1, {}, []]) {
      expect(
        normalizeNotificationPrefs({ liveEarningsStart: { enabled: value } }).liveEarningsStart
          .enabled,
      ).toBe(false);
    }
  });

  it('is filled in for a blob written before the feature shipped', () => {
    const result = normalizeNotificationPrefs({ dailyCheckin: { enabled: true } });
    expect(result.liveEarningsStart).toEqual(DEFAULT_NOTIFICATION_PREFS.liveEarningsStart);
  });

  it('keeps a stored schedule', () => {
    const stored = { enabled: true, days: [1, 3], hour: 7, minute: 30, hours: 6 };
    expect(normalizeNotificationPrefs({ liveEarningsStart: stored }).liveEarningsStart).toEqual(
      stored,
    );
  });

  it('validates the block rather than trusting it', () => {
    const result = normalizeNotificationPrefs({
      liveEarningsStart: { enabled: true, days: [1, 99], hour: 99, minute: 'x', hours: 99 },
    });
    expect(result.liveEarningsStart).toEqual({
      enabled: true,
      days: [1],
      hour: DEFAULT_NOTIFICATION_PREFS.liveEarningsStart.hour,
      minute: DEFAULT_NOTIFICATION_PREFS.liveEarningsStart.minute,
      hours: 8,
    });
  });
});

describe('reviewNotificationUrl', () => {
  it('deep links into the review insight at the right zoom', () => {
    expect(reviewNotificationUrl('week')).toBe('money2time://insights?focus=review&zoom=week');
    expect(reviewNotificationUrl('month')).toBe('money2time://insights?focus=review&zoom=month');
  });
});
