import {
  clampStartAt,
  clampStartedMinutesAgo,
  earnedByNow,
  maxStartedMinutesAgo,
  MS_PER_MINUTE,
  sessionEndFor,
  startedMinutesAgoFor,
  startHourBucketsFor,
  startMinuteOptionsFor,
  startWindowFor,
} from '~/features/widgets/lib/liveEarnings';

/** 2023-11-14, a whole minute in every zone, so the wheels line up predictably. */
const NOW = new Date(2023, 10, 14, 13, 4, 37).getTime();

describe('maxStartedMinutesAgo', () => {
  it('stops one minute short of the whole session, which would already be over', () => {
    expect(maxStartedMinutesAgo(1)).toBe(59);
    expect(maxStartedMinutesAgo(8)).toBe(479);
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

  it('keeps whole minutes, the finest the picker offers', () => {
    expect(clampStartedMinutesAgo(41, 4)).toBe(41);
    expect(clampStartedMinutesAgo(7.4, 4)).toBe(7);
  });

  it('never lets the start reach past the end of the session', () => {
    // A 2-hour session cannot have started 3 hours ago.
    expect(clampStartedMinutesAgo(180, 2)).toBe(119);
    expect(clampStartedMinutesAgo(600, 1)).toBe(59);
  });
});

describe('startWindowFor', () => {
  it('runs to the current minute, with the seconds dropped', () => {
    const { latest } = startWindowFor(NOW, 4);
    expect(new Date(latest).getSeconds()).toBe(0);
    expect(new Date(latest).getMinutes()).toBe(4);
  });

  it('reaches back exactly as far as the session allows', () => {
    const { earliest, latest } = startWindowFor(NOW, 2);
    expect((latest - earliest) / MS_PER_MINUTE).toBe(maxStartedMinutesAgo(2));
  });
});

describe('the start-time wheels', () => {
  it('offer every wall-clock hour the window touches, earliest first', () => {
    // 13:04 with a 2-hour session reaches back to 11:05, so three hours.
    const buckets = startHourBucketsFor(NOW, 2);
    expect(buckets.map((at) => new Date(at).getHours())).toEqual([11, 12, 13]);
    expect(buckets.every((at) => new Date(at).getMinutes() === 0)).toBe(true);
  });

  it('always end on the hour the user is in', () => {
    for (const hours of [1, 2, 4, 8]) {
      const buckets = startHourBucketsFor(NOW, hours);
      expect(new Date(buckets[buckets.length - 1]).getHours()).toBe(13);
    }
  });

  it('cut the first hour short, since the window starts part-way through it', () => {
    const [first] = startHourBucketsFor(NOW, 2);
    expect(startMinuteOptionsFor(NOW, 2, first)[0]).toBe(5);
  });

  it('cut the current hour at the present minute: a start cannot be in the future', () => {
    const buckets = startHourBucketsFor(NOW, 2);
    const last = buckets[buckets.length - 1];
    const minutes = startMinuteOptionsFor(NOW, 2, last);
    expect(minutes[minutes.length - 1]).toBe(4);
  });

  it('offer a whole hour in between', () => {
    expect(startMinuteOptionsFor(NOW, 2, startHourBucketsFor(NOW, 2)[1])).toHaveLength(60);
  });

  it('never offer a combination the clamp would move', () => {
    for (const hours of [1, 2, 4, 8]) {
      for (const bucket of startHourBucketsFor(NOW, hours)) {
        for (const minute of startMinuteOptionsFor(NOW, hours, bucket)) {
          const at = bucket + minute * MS_PER_MINUTE;
          expect(clampStartAt(at, NOW, hours)).toBe(at);
        }
      }
    }
  });
});

describe('clampStartAt', () => {
  it('pulls a start stranded by a shorter session back inside the window', () => {
    const threeHoursAgo = NOW - 180 * MS_PER_MINUTE;
    expect(clampStartAt(threeHoursAgo, NOW, 2)).toBe(startWindowFor(NOW, 2).earliest);
  });

  it('refuses a start in the future', () => {
    expect(clampStartAt(NOW + 60 * MS_PER_MINUTE, NOW, 4)).toBe(startWindowFor(NOW, 4).latest);
  });

  it('drops the seconds so the picked minute is what is honoured', () => {
    expect(new Date(clampStartAt(NOW - 30 * MS_PER_MINUTE, NOW, 4)).getSeconds()).toBe(0);
  });
});

describe('startedMinutesAgoFor', () => {
  it('counts whole minutes between the picked time and now', () => {
    expect(startedMinutesAgoFor(NOW - 95 * MS_PER_MINUTE, NOW)).toBe(95);
  });

  it('reads a start in the current minute as "just now"', () => {
    expect(startedMinutesAgoFor(NOW, NOW)).toBe(0);
    expect(startedMinutesAgoFor(NOW + 5 * MS_PER_MINUTE, NOW)).toBe(0);
  });
});

describe('a backdated session', () => {
  const RATE = 30;

  function backdated(minutesAgo: number, hours: number, now: number) {
    const startedAt = now - minutesAgo * MS_PER_MINUTE;
    return { startedAt, endsAt: sessionEndFor(startedAt, hours), hourlyRate: RATE };
  }

  it('opens at the amount already earned rather than zero', () => {
    expect(earnedByNow(backdated(120, 8, NOW), NOW)).toBeCloseTo(60, 6);
  });

  it('opens at zero when it is not backdated at all', () => {
    expect(earnedByNow(backdated(0, 8, NOW), NOW)).toBe(0);
  });

  it('ends earlier in wall-clock time, so the iOS ceiling is never at risk', () => {
    expect(backdated(120, 8, NOW).endsAt - NOW).toBeLessThan(8 * 60 * 60 * 1000);
  });

  it('is never already finished at the earliest time the wheels reach', () => {
    for (const hours of [1, 2, 4, 8]) {
      const session = backdated(maxStartedMinutesAgo(hours), hours, NOW);
      expect(session.endsAt).toBeGreaterThan(NOW);
    }
  });
});
