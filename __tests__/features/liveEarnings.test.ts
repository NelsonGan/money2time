import {
  clampSessionHours,
  earnedByNow,
  elapsedMs,
  formatElapsedClock,
  isSessionOver,
  LIVE_EARNINGS_MAX_HOURS,
  LIVE_EARNINGS_MIN_HOURS,
  type LiveEarningsSession,
  MS_PER_HOUR,
  sessionEndFor,
  sessionProgress,
} from '~/features/widgets/lib/liveEarnings';

const START = Date.UTC(2026, 7, 28, 9, 0, 0);

function session(hours: number, hourlyRate: number): LiveEarningsSession {
  return { startedAt: START, endsAt: START + hours * MS_PER_HOUR, hourlyRate };
}

describe('clampSessionHours', () => {
  it('keeps sensible durations untouched', () => {
    expect(clampSessionHours(1)).toBe(1);
    expect(clampSessionHours(4)).toBe(4);
    expect(clampSessionHours(8)).toBe(8);
  });

  it('clamps to what iOS will actually keep alive', () => {
    expect(clampSessionHours(0)).toBe(LIVE_EARNINGS_MIN_HOURS);
    expect(clampSessionHours(-3)).toBe(LIVE_EARNINGS_MIN_HOURS);
    expect(clampSessionHours(24)).toBe(LIVE_EARNINGS_MAX_HOURS);
  });

  it('falls back to the minimum for any non-finite input', () => {
    expect(clampSessionHours(Number.NaN)).toBe(LIVE_EARNINGS_MIN_HOURS);
    expect(clampSessionHours(Number.POSITIVE_INFINITY)).toBe(LIVE_EARNINGS_MIN_HOURS);
  });

  it('rounds fractional hours to a whole one', () => {
    expect(clampSessionHours(2.4)).toBe(2);
    expect(clampSessionHours(2.6)).toBe(3);
  });
});

describe('sessionEndFor', () => {
  it('adds the clamped duration to the start', () => {
    expect(sessionEndFor(START, 3)).toBe(START + 3 * MS_PER_HOUR);
  });

  it('never lands more than the iOS ceiling past the start', () => {
    expect(sessionEndFor(START, 50)).toBe(START + LIVE_EARNINGS_MAX_HOURS * MS_PER_HOUR);
  });
});

describe('elapsedMs', () => {
  const target = session(4, 30);

  it('is zero before the session starts', () => {
    expect(elapsedMs(target, START - 60_000)).toBe(0);
  });

  it('tracks real time inside the session', () => {
    expect(elapsedMs(target, START + 90 * 60_000)).toBe(90 * 60_000);
  });

  it('stops at the end rather than running on', () => {
    expect(elapsedMs(target, START + 10 * MS_PER_HOUR)).toBe(4 * MS_PER_HOUR);
  });

  it('is zero for a session that ends before it starts', () => {
    expect(elapsedMs({ startedAt: START, endsAt: START - 1, hourlyRate: 30 }, START)).toBe(0);
  });
});

describe('earnedByNow', () => {
  it('accrues linearly at the hourly rate', () => {
    const target = session(8, 18);
    expect(earnedByNow(target, START)).toBe(0);
    expect(earnedByNow(target, START + MS_PER_HOUR)).toBeCloseTo(18, 10);
    expect(earnedByNow(target, START + MS_PER_HOUR / 2)).toBeCloseTo(9, 10);
    expect(earnedByNow(target, START + 30_000)).toBeCloseTo(0.15, 10);
  });

  it('never pays past the end of the session', () => {
    const target = session(2, 18);
    expect(earnedByNow(target, START + 5 * MS_PER_HOUR)).toBeCloseTo(36, 10);
  });

  it('is zero when no hourly rate is configured', () => {
    expect(earnedByNow(session(4, 0), START + MS_PER_HOUR)).toBe(0);
    expect(earnedByNow(session(4, -20), START + MS_PER_HOUR)).toBe(0);
    expect(earnedByNow(session(4, Number.NaN), START + MS_PER_HOUR)).toBe(0);
  });

  it('is never negative before the session starts', () => {
    expect(earnedByNow(session(4, 18), START - MS_PER_HOUR)).toBe(0);
  });
});

describe('sessionProgress', () => {
  const target = session(4, 18);

  it('runs from 0 to 1 across the session', () => {
    expect(sessionProgress(target, START)).toBe(0);
    expect(sessionProgress(target, START + 2 * MS_PER_HOUR)).toBeCloseTo(0.5, 10);
    expect(sessionProgress(target, START + 4 * MS_PER_HOUR)).toBe(1);
  });

  it('stays clamped outside the session', () => {
    expect(sessionProgress(target, START - MS_PER_HOUR)).toBe(0);
    expect(sessionProgress(target, START + 40 * MS_PER_HOUR)).toBe(1);
  });

  it('is 0 rather than NaN for a zero-length session', () => {
    expect(sessionProgress({ startedAt: START, endsAt: START, hourlyRate: 18 }, START)).toBe(0);
  });
});

describe('isSessionOver', () => {
  it('flips exactly at the end', () => {
    const target = session(1, 18);
    expect(isSessionOver(target, target.endsAt - 1)).toBe(false);
    expect(isSessionOver(target, target.endsAt)).toBe(true);
  });
});

describe('formatElapsedClock', () => {
  const target = session(8, 18);

  it('matches the H:MM:SS shape of the activity clock', () => {
    expect(formatElapsedClock(target, START)).toBe('0:00:00');
    expect(formatElapsedClock(target, START + 7_000)).toBe('0:00:07');
    expect(formatElapsedClock(target, START + 65_000)).toBe('0:01:05');
    expect(formatElapsedClock(target, START + 2 * MS_PER_HOUR + 65_000)).toBe('2:01:05');
  });

  it('freezes at the session length once the session is over', () => {
    expect(formatElapsedClock(target, START + 100 * MS_PER_HOUR)).toBe('8:00:00');
  });
});
