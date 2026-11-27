import {
  buildTrialTimeline,
  trialEndDate,
  trialReminderDate,
  trialReminderDateForCustomer,
  trialReminderPermissionStep,
} from '~/features/settings/lib/trialTimeline';

const WEEK = { durationIso8601: 'P1W', durationCount: 1, durationUnit: 'week' } as const;

describe('trial timeline', () => {
  it('ends a one-week trial seven days after it starts', () => {
    const start = new Date(2026, 10, 27, 21, 15);
    expect(trialEndDate(start, WEEK)).toEqual(new Date(2026, 11, 4, 21, 15));
  });

  it('adds months and years on the calendar', () => {
    const start = new Date(2026, 0, 31, 9, 0);
    expect(
      trialEndDate(start, { durationIso8601: 'P3D', durationCount: 3, durationUnit: 'day' }),
    ).toEqual(new Date(2026, 1, 3, 9, 0));
    // A month from Jan 31 is the last day of February, not March 3.
    expect(
      trialEndDate(start, { durationIso8601: 'P1M', durationCount: 1, durationUnit: 'month' }),
    ).toEqual(new Date(2026, 1, 28, 9, 0));
    expect(
      trialEndDate(new Date(2028, 1, 29, 9, 0), {
        durationIso8601: 'P1Y',
        durationCount: 1,
        durationUnit: 'year',
      }),
    ).toEqual(new Date(2029, 1, 28, 9, 0));
    expect(
      trialEndDate(start, { durationIso8601: 'P1Y', durationCount: 1, durationUnit: 'year' }),
    ).toEqual(new Date(2027, 0, 31, 9, 0));
  });

  it('reminds at 10:00 two days before the trial ends', () => {
    const now = new Date(2026, 10, 27, 21, 15);
    const endsAt = new Date(2026, 11, 4, 21, 15);
    expect(trialReminderDate(endsAt, now)).toEqual(new Date(2026, 11, 2, 10, 0));
  });

  it('gives no reminder that would already have passed or come after the end', () => {
    const now = new Date(2026, 11, 2, 11, 0);
    expect(trialReminderDate(new Date(2026, 11, 4, 21, 15), now)).toBeNull();
    // A one-day trial: two days before its end is before it even started.
    expect(trialReminderDate(new Date(2026, 11, 3, 11, 0), now)).toBeNull();
    expect(trialReminderDate(new Date('not a date'), now)).toBeNull();
  });

  it('builds the paywall timeline and leaves the reminder out when it cannot be sent', () => {
    const now = new Date(2026, 10, 27, 21, 15);
    expect(buildTrialTimeline(WEEK, now, { canRemind: true })).toEqual({
      endsAt: new Date(2026, 11, 4, 21, 15),
      remindAt: new Date(2026, 11, 2, 10, 0),
    });
    expect(buildTrialTimeline(WEEK, now, { canRemind: false }).remindAt).toBeNull();
  });

  it('reminds only a customer in a free trial that is still set to renew', () => {
    const now = new Date(2026, 10, 27, 21, 15);
    const expirationDate = new Date(2026, 11, 4, 21, 15).toISOString();
    const trial = { periodType: 'trial', hasRenewingSubscription: true, expirationDate } as const;
    expect(trialReminderDateForCustomer(trial, now)).toEqual(new Date(2026, 11, 2, 10, 0));
    expect(
      trialReminderDateForCustomer({ ...trial, hasRenewingSubscription: false }, now),
    ).toBeNull();
    expect(trialReminderDateForCustomer({ ...trial, periodType: 'normal' }, now)).toBeNull();
    expect(trialReminderDateForCustomer({ ...trial, expirationDate: null }, now)).toBeNull();
    expect(trialReminderDateForCustomer(null, now)).toBeNull();
  });

  it('asks with the system prompt while it can still show, and offers Settings once it cannot', () => {
    expect(trialReminderPermissionStep({ status: 'granted', canAskAgain: true })).toBe('none');
    expect(trialReminderPermissionStep({ status: 'undetermined', canAskAgain: true })).toBe('ask');
    // Android lets the app ask again after a single refusal.
    expect(trialReminderPermissionStep({ status: 'denied', canAskAgain: true })).toBe('ask');
    // iOS asks only once.
    expect(trialReminderPermissionStep({ status: 'denied', canAskAgain: false })).toBe('settings');
  });
});
