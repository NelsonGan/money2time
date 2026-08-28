import {
  clampStartedMinutesAgo,
  earnedByNow,
  LIVE_EARNINGS_OFFSET_STEP_MINUTES,
  maxStartedMinutesAgo,
  MS_PER_MINUTE,
  offsetOptionsForHours,
  sessionEndFor,
} from '~/features/widgets/lib/liveEarnings';

describe('maxStartedMinutesAgo', () => {
  it('stops one step short of the whole session, which would already be over', () => {
    expect(maxStartedMinutesAgo(1)).toBe(60 - LIVE_EARNINGS_OFFSET_STEP_MINUTES);
    expect(maxStartedMinutesAgo(8)).toBe(480 - LIVE_EARNINGS_OFFSET_STEP_MINUTES);
  });

  it('clamps the duration first, so a nonsense session still gives a sane bound', () => {
    expect(maxStartedMinutesAgo(99)).toBe(maxStartedMinutesAgo(8));
    expect(maxStartedMinutesAgo(0)).toBe(maxStartedMinutesAgo(1));
  });
});

describe('clampStartedMinutesAgo', () => {
  it('treats anything at or below zero as "just now"', () => {
    expect(clampStartedMinutesAgo(0, 4)).toBe(0);
    expect(clampStartedMinutesAgo(-90, 4)).toBe(0);
    expect(clampStartedMinutesAgo(Number.NaN, 4)).toBe(0);
  });

  it('snaps to the half-hour grid the picker offers', () => {
    expect(clampStartedMinutesAgo(41, 4)).toBe(30);
    expect(clampStartedMinutesAgo(50, 4)).toBe(60);
  });

  it('never lets the offset reach past the end of the session', () => {
    // A 2-hour session cannot have started 3 hours ago.
    expect(clampStartedMinutesAgo(180, 2)).toBe(90);
    expect(clampStartedMinutesAgo(600, 1)).toBe(30);
  });
});

describe('offsetOptionsForHours', () => {
  it('runs from "just now" to the bound, in half-hour steps', () => {
    expect(offsetOptionsForHours(2)).toEqual([0, 30, 60, 90]);
  });

  it('always offers at least "just now"', () => {
    expect(offsetOptionsForHours(1)[0]).toBe(0);
    expect(offsetOptionsForHours(1)).toEqual([0, 30]);
  });

  it('never offers an option the clamp would reject', () => {
    for (const hours of [1, 2, 4, 8]) {
      for (const option of offsetOptionsForHours(hours)) {
        expect(clampStartedMinutesAgo(option, hours)).toBe(option);
      }
    }
  });
});

describe('a backdated session', () => {
  const RATE = 30;

  function backdated(minutesAgo: number, hours: number, now: number) {
    const startedAt = now - minutesAgo * MS_PER_MINUTE;
    return { startedAt, endsAt: sessionEndFor(startedAt, hours), hourlyRate: RATE };
  }

  it('opens at the amount already earned rather than zero', () => {
    const now = 1_700_000_000_000;
    expect(earnedByNow(backdated(120, 8, now), now)).toBeCloseTo(60, 6);
  });

  it('opens at zero when it is not backdated at all', () => {
    const now = 1_700_000_000_000;
    expect(earnedByNow(backdated(0, 8, now), now)).toBe(0);
  });

  it('ends earlier in wall-clock time, so the iOS ceiling is never at risk', () => {
    const now = 1_700_000_000_000;
    const session = backdated(120, 8, now);
    expect(session.endsAt - now).toBeLessThan(8 * 60 * 60 * 1000);
  });

  it('is never already finished at the largest offer the picker makes', () => {
    const now = 1_700_000_000_000;
    for (const hours of [1, 2, 4, 8]) {
      const options = offsetOptionsForHours(hours);
      const session = backdated(options[options.length - 1], hours, now);
      expect(session.endsAt).toBeGreaterThan(now);
    }
  });
});
