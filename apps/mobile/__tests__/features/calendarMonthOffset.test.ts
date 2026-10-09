import { monthOffsetForDayKey } from '~/features/calendar/lib/calendarBuild';

describe('monthOffsetForDayKey', () => {
  // A local start-of-month Date, exactly how CalendarScreen builds its pager
  // anchor via startOfMonthDate(new Date()).
  const anchor = new Date(2026, 6, 1); // July 2026 (month index 6), local midnight

  it('returns 0 for a day in the anchor month', () => {
    expect(monthOffsetForDayKey(anchor, '2026-07-20')).toBe(0);
  });

  it('returns 0 for the first and last day of the anchor month', () => {
    expect(monthOffsetForDayKey(anchor, '2026-07-01')).toBe(0);
    expect(monthOffsetForDayKey(anchor, '2026-07-31')).toBe(0);
  });

  it('returns a negative offset for an earlier month', () => {
    expect(monthOffsetForDayKey(anchor, '2026-06-15')).toBe(-1);
    expect(monthOffsetForDayKey(anchor, '2025-07-15')).toBe(-12);
  });

  it('returns a positive offset for a later month', () => {
    expect(monthOffsetForDayKey(anchor, '2026-08-03')).toBe(1);
    expect(monthOffsetForDayKey(anchor, '2027-01-03')).toBe(6);
  });

  it('returns null for a malformed day key', () => {
    expect(monthOffsetForDayKey(anchor, 'not-a-date')).toBeNull();
    expect(monthOffsetForDayKey(anchor, '2026-13-01')).toBeNull();
    expect(monthOffsetForDayKey(anchor, '2026-00-01')).toBeNull();
  });

  // Regression: adding a quick entry dated in the current month bounced the
  // calendar to the previous month in timezones behind UTC. The old code built
  // the target month as `Date.UTC(year, monthIndex, 1)` and then read its LOCAL
  // getMonth(), so July-1-UTC read back as June locally in the Americas. Reading
  // the month straight from the YYYY-MM-DD digits must be timezone-independent.
  it('is stable regardless of the runtime timezone (no UTC/local drift)', () => {
    const originalTz = process.env.TZ;
    try {
      for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        // A same-month day must always resolve to offset 0 — never -1.
        expect(monthOffsetForDayKey(new Date(2026, 6, 1), '2026-07-20')).toBe(0);
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
