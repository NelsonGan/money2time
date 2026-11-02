/**
 * @jest-environment ./__tests__/environments/timeZoneEnvironment.js
 */
import { recurringRunTransactionId } from '~/lib/repositories/recurringRulesRepository';
import type { RecurringTransactionRule } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import {
  effectiveAnchorDay,
  isSameRunDay,
  nextRunAfter,
  projectRecurringOccurrences,
  runDayKeyOf,
  runDayOf,
} from '~/utils/recurringRules';

// Run dates are local calendar days, so every case runs in a zone east of UTC
// (where local midnight is the previous UTC day), one west of it with daylight
// saving, and UTC itself.
const ZONES = ['Asia/Kuala_Lumpur', 'America/New_York', 'UTC'] as const;

/** Set by the time zone environment named at the top of this file. */
declare const setTimeZone: (zone: string | undefined) => void;

function useTimeZone(zone: string) {
  beforeAll(() => setTimeZone(zone));
  afterAll(() => setTimeZone(undefined));
}

/** Local midnight of a day key, as the editor stores a picked day. */
const midnight = (dayKey: string) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
};

/** The day keys a rule runs on, `count` runs from `start`. */
function walk(
  start: string,
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
  count: number,
  anchorDay?: number | null,
): string[] {
  const days: string[] = [];
  let cursor: string | null = start;
  for (let index = 0; index < count && cursor; index += 1) {
    days.push(dayKeyFromIsoLocal(cursor));
    cursor = nextRunAfter(cursor, pattern, interval, anchorDay);
  }
  return days;
}

/** Minutes behind UTC on 1 January, as `getTimezoneOffset` reports them. */
const JANUARY_OFFSET: Record<(typeof ZONES)[number], number> = {
  'Asia/Kuala_Lumpur': -480,
  'America/New_York': 300,
  UTC: 0,
};

describe.each(ZONES)('run dates in %s', (zone) => {
  useTimeZone(zone);

  it('runs in that zone', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(JANUARY_OFFSET[zone]);
  });

  it('keeps a rule on the 1st on the 1st every month', () => {
    expect(walk(midnight('2026-01-01'), 'monthly', 1, 13, 1)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ]);
  });

  it('returns a rule on the 31st to the 31st after a shorter month', () => {
    expect(walk(midnight('2026-01-31'), 'monthly', 1, 7, 31)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
    ]);
  });

  it('runs a rule on the 30th on February 28 and the 30th otherwise', () => {
    expect(walk(midnight('2026-01-30'), 'monthly', 1, 4, 30)).toEqual([
      '2026-01-30',
      '2026-02-28',
      '2026-03-30',
      '2026-04-30',
    ]);
  });

  it('uses February 29 in a leap year', () => {
    expect(walk(midnight('2028-01-31'), 'monthly', 1, 3, 31)).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
  });

  it('keeps the anchor across a quarterly rule', () => {
    expect(walk(midnight('2026-08-31'), 'monthly', 3, 4, 31)).toEqual([
      '2026-08-31',
      '2026-11-30',
      '2027-02-28',
      '2027-05-31',
    ]);
  });

  it('brings a yearly rule on February 29 back to it in the next leap year', () => {
    expect(walk(midnight('2028-02-29'), 'yearly', 1, 5, 29)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('keeps the date its own day without an anchor', () => {
    expect(walk(midnight('2026-01-15'), 'monthly', 1, 3)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('steps whole local days and weeks, across daylight saving changes', () => {
    // New York leaves daylight saving on 1 November 2026 and starts it on
    // 14 March 2027; a step in UTC hours would land on the evening before.
    expect(walk(midnight('2026-10-25'), 'weekly', 1, 3)).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
    ]);
    expect(walk(midnight('2027-03-13'), 'daily', 1, 3)).toEqual([
      '2027-03-13',
      '2027-03-14',
      '2027-03-15',
    ]);
  });

  it('writes local midnight', () => {
    expect(nextRunAfter(midnight('2026-01-31'), 'monthly', 1, 31)).toBe(midnight('2026-02-28'));
  });

  it('reads a bare day key as that local day', () => {
    // Loan repayments and goal auto-saves start from one.
    expect(nextRunAfter('2026-07-31', 'monthly', 1, 31)).toBe(midnight('2026-08-31'));
    expect(nextRunAfter('2026-11-30', 'monthly', 1, 31)).toBe(midnight('2026-12-31'));
  });

  it('reads an exactly-UTC-midnight date, an older day key step, as its UTC day', () => {
    expect(runDayKeyOf('2026-08-30T00:00:00.000Z')).toBe('2026-08-30');
    expect(nextRunAfter('2026-08-30T00:00:00.000Z', 'monthly', 1, 30)).toBe(midnight('2026-09-30'));
  });

  it('reads 23:00 local, a midnight an hour off, as the next day', () => {
    const shifted = new Date(2026, 10, 30, 23, 0, 0, 0).toISOString();
    expect(runDayKeyOf(shifted)).toBe('2026-12-01');
    expect(isSameRunDay(shifted, '2026-12-01')).toBe(true);
  });

  it('reads any other time as its local day', () => {
    const afternoon = new Date(2026, 10, 30, 15, 30).toISOString();
    expect(runDayKeyOf(afternoon)).toBe('2026-11-30');
    expect(nextRunAfter(afternoon, 'monthly', 1)).toBe(midnight('2026-12-30'));
  });

  it('names a run after its calendar day, the same in every zone', () => {
    // Two phones sharing a ledger in different zones must name a run alike.
    expect(recurringRunTransactionId('rent', midnight('2026-08-01'))).toBe('rr:rent:2026-08-01');
    expect(recurringRunTransactionId('rent', '2026-08-01')).toBe('rr:rent:2026-08-01');
  });

  it('follows the run date when it has moved off its anchor', () => {
    // Anchored on the 31st but moved to the 15th (an older phone edited it).
    expect(effectiveAnchorDay({ year: 2026, month: 5, day: 15 }, 31)).toBe(15);
    expect(walk(midnight('2026-06-15'), 'monthly', 1, 3, 31)).toEqual([
      '2026-06-15',
      '2026-07-15',
      '2026-08-15',
    ]);
    // On a month's last day, the 31st is still its anchor.
    expect(effectiveAnchorDay({ year: 2026, month: 1, day: 28 }, 31)).toBe(31);
  });

  it('forecasts the anchored dates the runner writes', () => {
    const rule = {
      id: 'rent',
      isActive: true,
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      nextRunDate: midnight('2027-02-28'),
      anchorDay: 31,
      endDate: null,
    } as RecurringTransactionRule;
    expect(
      projectRecurringOccurrences([rule], { fromDayKey: '2027-02-01', days: 120 }).map(
        (occurrence) => occurrence.dayKey,
      ),
    ).toEqual(['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
  });
});

describe('runDayOf', () => {
  it('is null for something that is not a date', () => {
    expect(runDayOf('not-a-date')).toBeNull();
    expect(nextRunAfter('not-a-date', 'monthly', 1)).toBeNull();
  });
});
