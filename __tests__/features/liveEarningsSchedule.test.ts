import {
  DEFAULT_LIVE_EARNINGS_SCHEDULE,
  buildScheduleRegistration,
  normalizeLiveEarningsSchedule,
  normalizeScheduleDays,
  scheduleEndClock,
  scheduledSessionTotal,
  toggleScheduleDay,
  weekdaysFrom,
} from '~/features/widgets/lib/liveEarningsSchedule';
import type { LiveEarningsSchedule } from '~/types';

describe('normalizeScheduleDays', () => {
  it('sorts and deduplicates', () => {
    expect(normalizeScheduleDays([5, 1, 5, 3])).toEqual([1, 3, 5]);
  });

  it('drops entries that are not weekdays', () => {
    expect(normalizeScheduleDays([1, 7, -1, 2.5, 'mon', null, 4])).toEqual([1, 4]);
  });

  it('falls back to the default only when the value is not a list at all', () => {
    expect(normalizeScheduleDays(undefined)).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeScheduleDays('everyday')).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves an explicitly empty list, which is what clearing every chip gives', () => {
    expect(normalizeScheduleDays([])).toEqual([]);
  });
});

describe('normalizeLiveEarningsSchedule', () => {
  it('returns the default for a blob written before the feature existed', () => {
    expect(normalizeLiveEarningsSchedule(undefined)).toEqual(DEFAULT_LIVE_EARNINGS_SCHEDULE);
    expect(normalizeLiveEarningsSchedule(null)).toEqual(DEFAULT_LIVE_EARNINGS_SCHEDULE);
    expect(normalizeLiveEarningsSchedule('nope')).toEqual(DEFAULT_LIVE_EARNINGS_SCHEDULE);
  });

  it('clamps out-of-range times back to the default', () => {
    const result = normalizeLiveEarningsSchedule({ hour: 25, minute: -3 });
    expect(result.hour).toBe(DEFAULT_LIVE_EARNINGS_SCHEDULE.hour);
    expect(result.minute).toBe(DEFAULT_LIVE_EARNINGS_SCHEDULE.minute);
  });

  it('clamps the duration to the window iOS allows', () => {
    expect(normalizeLiveEarningsSchedule({ hours: 40 }).hours).toBe(8);
    expect(normalizeLiveEarningsSchedule({ hours: 0 }).hours).toBe(1);
    expect(normalizeLiveEarningsSchedule({ shiftHours: 40 }).shiftHours).toBe(8);
    expect(normalizeLiveEarningsSchedule({ shiftHours: 0 }).shiftHours).toBe(1);
  });

  it('inherits the shift length from a blob written before the two split', () => {
    // Until `shiftHours` existed the schedule fired for `hours`, so an install
    // upgrading into it must keep scheduling exactly what it already was.
    expect(normalizeLiveEarningsSchedule({ hours: 6 })).toMatchObject({
      hours: 6,
      shiftHours: 6,
    });
  });

  it('falls back to a full working day when the blob names neither', () => {
    expect(normalizeLiveEarningsSchedule({ hour: 7 }).shiftHours).toBe(8);
  });

  it('keeps the two lengths apart once both are stored', () => {
    expect(normalizeLiveEarningsSchedule({ hours: 2, shiftHours: 8 })).toMatchObject({
      hours: 2,
      shiftHours: 8,
    });
  });

  it('keeps a valid schedule intact', () => {
    const raw = { enabled: true, days: [2, 4], hour: 7, minute: 30, hours: 6, shiftHours: 8 };
    expect(normalizeLiveEarningsSchedule(raw)).toEqual(raw);
  });

  it('keeps an enabled schedule with no days, which is mid-edit, not invalid', () => {
    const result = normalizeLiveEarningsSchedule({ enabled: true, days: [] });
    expect(result).toMatchObject({ enabled: true, days: [] });
  });

  it('treats a non-boolean enabled as off', () => {
    expect(normalizeLiveEarningsSchedule({ enabled: 'yes' }).enabled).toBe(false);
  });
});

describe('toggleScheduleDay', () => {
  it('adds a missing day and keeps the list sorted', () => {
    expect(toggleScheduleDay([1, 5], 3)).toEqual([1, 3, 5]);
  });

  it('removes a day already selected', () => {
    expect(toggleScheduleDay([1, 3, 5], 3)).toEqual([1, 5]);
  });

  it('can empty the list, which the caller normalizes', () => {
    expect(toggleScheduleDay([3], 3)).toEqual([]);
  });
});

describe('weekdaysFrom', () => {
  it('starts on Sunday when the week does', () => {
    expect(weekdaysFrom(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('rotates to the configured first day', () => {
    expect(weekdaysFrom(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdaysFrom(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it('falls back to Sunday for a nonsense start', () => {
    expect(weekdaysFrom(9)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('the module-level defaults', () => {
  it('are never handed out by reference, so a caller cannot corrupt them', () => {
    const a = normalizeLiveEarningsSchedule(undefined);
    const b = normalizeLiveEarningsSchedule(undefined);
    expect(a).not.toBe(DEFAULT_LIVE_EARNINGS_SCHEDULE);
    expect(a.days).not.toBe(DEFAULT_LIVE_EARNINGS_SCHEDULE.days);

    a.days.push(6);
    expect(b.days).toEqual([1, 2, 3, 4, 5]);
    expect(DEFAULT_LIVE_EARNINGS_SCHEDULE.days).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('scheduleEndClock', () => {
  const at = (hour: number, minute: number, shiftHours: number) =>
    // `hours` is deliberately a different number: the end of a *scheduled*
    // shift is read off the shift's own length, never off the length a
    // hand-started session happens to be set to.
    scheduleEndClock({ enabled: true, days: [1], hour, minute, hours: 1, shiftHours });

  it('reads the end of an ordinary day shift', () => {
    expect(at(9, 0, 8)).toEqual({ hour: 17, minute: 0 });
    expect(at(8, 30, 4)).toEqual({ hour: 12, minute: 30 });
  });

  it('wraps a night shift past midnight', () => {
    // The label is a wall clock, not a date: 02:00 is 02:00 whichever day it
    // lands on, which is also why this is minute arithmetic and not a Date.
    expect(at(22, 0, 4)).toEqual({ hour: 2, minute: 0 });
    expect(at(23, 45, 8)).toEqual({ hour: 7, minute: 45 });
  });

  it('clamps a duration the iOS ceiling would not allow', () => {
    expect(at(9, 0, 99)).toEqual({ hour: 17, minute: 0 });
  });
});

describe('buildScheduleRegistration', () => {
  const copy = {
    titleText: 'earned',
    rateText: 'RM45.00/hr',
    endsText: 'Ends 5:00 PM',
    totalText: 'of RM360.00',
    refreshText: 'Refresh',
    alertTitle: 'Live earnings started',
    alertBody: 'Your clock is running.',
  };

  const build = (schedule: Partial<LiveEarningsSchedule> = {}) =>
    buildScheduleRegistration({
      schedule: {
        enabled: true,
        days: [1, 2, 3, 4, 5],
        hour: 9,
        minute: 0,
        hours: 2,
        shiftHours: 8,
        ...schedule,
      },
      hourlyRate: 45,
      currencySymbol: 'RM',
      timeZone: 'Asia/Kuala_Lumpur',
      pushToStartToken: 'ab'.repeat(64),
      accent: { accentLightHex: 0x1f8a6f, accentDarkHex: 0x34c99a },
      copy,
      formatAmount: (value) => `RM${value.toFixed(2)}`,
    });

  it('carries the shift and every string the card will show', () => {
    expect(build()).toEqual({
      pushToStartToken: 'ab'.repeat(64),
      timeZone: 'Asia/Kuala_Lumpur',
      days: [1, 2, 3, 4, 5],
      hour: 9,
      minute: 0,
      durationMinutes: 480,
      hourlyRate: 45,
      currencySymbol: 'RM',
      zeroText: 'RM0.00',
      accentLightHex: 0x1f8a6f,
      accentDarkHex: 0x34c99a,
      ...copy,
    });
  });

  it('normalizes the days, so two equal schedules register identically', () => {
    expect(build({ days: [3, 1, 1] as LiveEarningsSchedule['days'] }).days).toEqual([1, 3]);
  });

  it('clamps the duration to what a Live Activity can actually run for', () => {
    expect(build({ shiftHours: 99 }).durationMinutes).toBe(480);
    expect(build({ shiftHours: 0 }).durationMinutes).toBe(60);
  });

  it('registers the shift length, not the hand-started session length', () => {
    // The regression this pins: the two used to be one field, so clocking in
    // for two hours of overtime rewrote every scheduled day to two hours.
    expect(build({ hours: 2, shiftHours: 8 }).durationMinutes).toBe(480);
  });
});

describe('scheduledSessionTotal', () => {
  it('is the whole shift at the registered rate', () => {
    const schedule: LiveEarningsSchedule = {
      enabled: true,
      days: [1],
      hour: 9,
      minute: 0,
      hours: 1,
      shiftHours: 8,
    };
    expect(scheduledSessionTotal(schedule, 45)).toBe(360);
  });
});
