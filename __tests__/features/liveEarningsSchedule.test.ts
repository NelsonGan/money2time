import {
  DEFAULT_LIVE_EARNINGS_SCHEDULE,
  normalizeLiveEarningsSchedule,
  normalizeScheduleDays,
  toggleScheduleDay,
  weekdaysFrom,
} from '~/features/widgets/lib/liveEarningsSchedule';

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
  });

  it('keeps a valid schedule intact', () => {
    const raw = { enabled: true, days: [2, 4], hour: 7, minute: 30, hours: 6 };
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
