/**
 * @jest-environment ./__tests__/environments/timeZoneEnvironment.js
 */
import {
  daysInCalendarMonth,
  localDayOfTime,
  resetLocalDays,
  syncLocalDaysWithTimeZone,
} from '~/utils/localDate';

/** Set by the time zone environment named at the top of this file. */
declare const setTimeZone: (zone: string | undefined) => void;

// Zones picked for what they do to a day: no daylight saving, the usual
// one-hour kind, a half-hour kind (Lord Howe), offsets off the hour
// (Kathmandu, Chatham), midnight changes (Sao Paulo, Tehran), a zone that
// winds back for Ramadan (Casablanca), ones that moved their clocks for good
// (Pyongyang, Caracas), a whole day skipped (Apia, 30 December 2011) and the
// far ends of the map (Kiritimati, Niue).
const ZONES = [
  'UTC',
  'Asia/Kuala_Lumpur',
  'America/New_York',
  'Europe/London',
  'Australia/Lord_Howe',
  'Asia/Kathmandu',
  'Pacific/Chatham',
  'America/Sao_Paulo',
  'Asia/Tehran',
  'Africa/Casablanca',
  'Asia/Pyongyang',
  'America/Caracas',
  'Pacific/Apia',
  'Pacific/Kiritimati',
  'Pacific/Niue',
  'Antarctica/Troll',
];

const pad2 = (value: number) => String(value).padStart(2, '0');

function expected(timeMs: number) {
  const date = new Date(timeMs);
  const year = date.getFullYear();
  const month1 = date.getMonth() + 1;
  const day = date.getDate();
  const monthKey = `${year}-${pad2(month1)}`;
  return { dayKey: `${monthKey}-${pad2(day)}`, monthKey, year, month1, day };
}

afterAll(() => {
  setTimeZone(undefined);
  resetLocalDays();
});

describe.each(ZONES)('localDayOfTime in %s', (zone) => {
  beforeAll(() => {
    setTimeZone(zone);
    resetLocalDays();
  });

  it('matches Date across 1990 to 2040, newest first', () => {
    // A step that is not a whole number of hours, so every time of day and
    // every side of a clock change is visited.
    const step = 7 * 3_600_000 + 13 * 60_000 + 7_000;
    const mismatches: string[] = [];
    for (let time = Date.UTC(2040, 0, 1); time >= Date.UTC(1990, 0, 1); time -= step) {
      const got = localDayOfTime(time);
      const want = expected(time);
      if (
        got.dayKey !== want.dayKey ||
        got.monthKey !== want.monthKey ||
        got.year !== want.year ||
        got.month1 !== want.month1 ||
        got.day !== want.day
      ) {
        mismatches.push(`${new Date(time).toISOString()}: ${got.dayKey} != ${want.dayKey}`);
        if (mismatches.length > 5) break;
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('matches Date minute by minute around every clock change of 2011, 2015 and 2024', () => {
    const mismatches: string[] = [];
    for (const year of [2011, 2015, 2024]) {
      let previous = new Date(Date.UTC(year, 0, 1)).getTimezoneOffset();
      for (let hour = Date.UTC(year, 0, 1); hour < Date.UTC(year + 1, 0, 1); hour += 3_600_000) {
        const offset = new Date(hour).getTimezoneOffset();
        if (offset === previous) continue;
        previous = offset;
        for (let time = hour - 36 * 3_600_000; time < hour + 36 * 3_600_000; time += 60_000) {
          const got = localDayOfTime(time).dayKey;
          const want = expected(time).dayKey;
          if (got !== want) mismatches.push(`${new Date(time).toISOString()}: ${got} != ${want}`);
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('answers as Date does outside the cached range', () => {
    for (const time of [Date.UTC(1969, 11, 31, 23, 59), Date.UTC(1900, 5, 15), Date.UTC(2150, 0, 1)]) {
      expect(localDayOfTime(time)).toEqual(expected(time));
    }
  });
});

describe('localDayOfTime', () => {
  beforeAll(() => {
    setTimeZone('Asia/Kuala_Lumpur');
    resetLocalDays();
  });

  it('hands back one shared day per calendar day', () => {
    const morning = localDayOfTime(Date.UTC(2026, 10, 9, 1));
    const evening = localDayOfTime(Date.UTC(2026, 10, 9, 15, 59));
    expect(morning.dayKey).toBe('2026-11-09');
    expect(evening).toBe(morning);
    // 16:00 UTC is midnight in Kuala Lumpur.
    expect(localDayOfTime(Date.UTC(2026, 10, 9, 16)).dayKey).toBe('2026-11-10');
  });

  it('follows the device into another time zone', () => {
    const time = Date.UTC(2026, 10, 9, 20);
    expect(localDayOfTime(time).dayKey).toBe('2026-11-10');
    expect(syncLocalDaysWithTimeZone()).toBe(false);
    setTimeZone('America/New_York');
    expect(syncLocalDaysWithTimeZone()).toBe(true);
    expect(localDayOfTime(time).dayKey).toBe('2026-11-09');
    expect(syncLocalDaysWithTimeZone()).toBe(false);
  });

  it('notices a new zone when it learns a block of days it has not seen', () => {
    setTimeZone('Asia/Kuala_Lumpur');
    resetLocalDays();
    expect(localDayOfTime(Date.UTC(2026, 10, 9, 20)).dayKey).toBe('2026-11-10');
    setTimeZone('America/New_York');
    // A date far from the block learned above.
    expect(localDayOfTime(Date.UTC(2019, 2, 3, 2)).dayKey).toBe('2019-03-02');
    expect(localDayOfTime(Date.UTC(2026, 10, 9, 20)).dayKey).toBe('2026-11-09');
  });
});

describe('daysInCalendarMonth', () => {
  it('matches Date for every month of 1900 to 2100', () => {
    for (let year = 1900; year <= 2100; year += 1) {
      for (let month1 = 1; month1 <= 12; month1 += 1) {
        expect(daysInCalendarMonth(year, month1)).toBe(new Date(year, month1, 0).getDate());
      }
    }
  });
});
