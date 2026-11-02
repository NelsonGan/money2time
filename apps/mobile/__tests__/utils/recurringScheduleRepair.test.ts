/**
 * @jest-environment ./__tests__/environments/timeZoneEnvironment.js
 */
import type { RecurrencePattern } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { legacyNextRunAfter, repairRecurringSchedule } from '~/utils/recurringScheduleRepair';

/** Set by the time zone environment named at the top of this file. */
declare const setTimeZone: (zone: string | undefined) => void;

const ZONES = ['Asia/Kuala_Lumpur', 'America/New_York', 'UTC'] as const;

/** Local midnight of a day key, as the editor stores a picked day. */
const midnight = (dayKey: string) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
};

/**
 * What an older version left behind for a rule started on `start`: the run
 * dates it wrote and the next run date it stored after `runs` runs.
 */
function legacyHistory(start: string, pattern: RecurrencePattern, interval: number, runs: number) {
  const runDates: string[] = [];
  let cursor = start;
  for (let index = 0; index < runs; index += 1) {
    runDates.push(cursor);
    cursor = legacyNextRunAfter(cursor, pattern, interval) as string;
  }
  return { runDates, nextRunDate: cursor };
}

describe('the arithmetic older versions used', () => {
  afterAll(() => setTimeZone(undefined));

  it('moved a rule on the 1st to the 29th east of UTC', () => {
    setTimeZone('Asia/Kuala_Lumpur');
    const { runDates, nextRunDate } = legacyHistory(midnight('2026-02-01'), 'monthly', 1, 4);
    expect([...runDates, nextRunDate].map(dayKeyFromIsoLocal)).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-03-29',
      '2026-04-29',
      '2026-05-29',
    ]);
  });

  it('kept a rule on the 31st on the 28th after February', () => {
    setTimeZone('UTC');
    const { runDates, nextRunDate } = legacyHistory(midnight('2026-01-31'), 'monthly', 1, 3);
    expect([...runDates, nextRunDate].map(dayKeyFromIsoLocal)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
      '2026-04-28',
    ]);
  });
});

describe.each(ZONES)('repairing a rule saved before anchor days, in %s', (zone) => {
  beforeAll(() => setTimeZone(zone));
  afterAll(() => setTimeZone(undefined));

  const repair = (
    start: string,
    runs: number,
    extra: { pattern?: RecurrencePattern; interval?: number; intendedDay?: number | null } = {},
  ) => {
    const pattern = extra.pattern ?? 'monthly';
    const interval = extra.interval ?? 1;
    const history = legacyHistory(start, pattern, interval, runs);
    return repairRecurringSchedule({
      ...history,
      recurrencePattern: pattern,
      recurrenceInterval: interval,
      intendedDay: extra.intendedDay,
    });
  };

  it('puts a rule on the 31st back on the 31st', () => {
    // Runs January to October; November's is next.
    const repaired = repair(midnight('2026-01-31'), 10);
    expect(repaired?.anchorDay).toBe(31);
    expect(repaired?.nextRunDate).toBe(midnight('2026-11-30'));
  });

  it('puts a rule on the 1st back on the 1st', () => {
    const repaired = repair(midnight('2026-02-01'), 10);
    expect(repaired?.anchorDay).toBe(1);
    expect(repaired?.nextRunDate).toBe(midnight('2026-12-01'));
  });

  it('keeps the next run the same occurrence when the old date had slipped into the next month', () => {
    // East of UTC, February's run of a rule on the 30th was stored as March 1.
    const repaired = repair(midnight('2026-01-30'), 1);
    expect(repaired?.anchorDay).toBe(30);
    expect(repaired?.nextRunDate).toBe(midnight('2026-02-28'));
  });

  it('leaves a rule on the 15th where it is, as local midnight', () => {
    const repaired = repair(midnight('2026-01-15'), 6);
    expect(repaired?.anchorDay).toBe(15);
    expect(dayKeyFromIsoLocal(repaired?.nextRunDate ?? '')).toBe('2026-07-15');
  });

  it('repairs a quarterly rule', () => {
    const repaired = repair(midnight('2026-01-31'), 3, { interval: 3 });
    expect(repaired?.anchorDay).toBe(31);
    expect(repaired?.nextRunDate).toBe(midnight('2026-10-31'));
  });

  it('brings a yearly rule on February 29 back to it', () => {
    const repaired = repair(midnight('2024-02-29'), 4, { pattern: 'yearly' });
    expect(repaired?.anchorDay).toBe(29);
    expect(repaired?.nextRunDate).toBe(midnight('2028-02-29'));
  });

  it('anchors a loan on its payment day from the bare day key of its first instalment', () => {
    const repaired = repair('2026-01-31', 5, { intendedDay: 31 });
    expect(repaired?.anchorDay).toBe(31);
    expect(repaired?.nextRunDate).toBe(midnight('2026-06-30'));
  });

  it("anchors a goal's auto-save on the day it was set up when it has not run yet", () => {
    // Set up on January 31, so it first runs on February 28.
    const repaired = repairRecurringSchedule({
      nextRunDate: '2026-02-28',
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      runDates: [],
      intendedDay: 31,
    });
    expect(repaired).toEqual({ anchorDay: 31, nextRunDate: '2026-02-28' });
  });

  it('ignores an intended day the schedule does not start on', () => {
    const repaired = repair('2026-01-15', 2, { intendedDay: 31 });
    expect(repaired?.anchorDay).toBe(15);
  });

  it('leaves a date the user picked and that has not run since alone', () => {
    const history = legacyHistory(midnight('2026-01-31'), 'monthly', 1, 4);
    const repaired = repairRecurringSchedule({
      runDates: history.runDates,
      nextRunDate: midnight('2026-06-10'),
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
    });
    expect(repaired).toEqual({ anchorDay: 10, nextRunDate: midnight('2026-06-10') });
  });

  it('starts from the date the user last picked when the rule ran after it', () => {
    const before = legacyHistory(midnight('2026-01-15'), 'monthly', 1, 3);
    const after = legacyHistory(midnight('2026-05-31'), 'monthly', 1, 3);
    const repaired = repairRecurringSchedule({
      runDates: [...after.runDates, ...before.runDates],
      nextRunDate: after.nextRunDate,
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
    });
    expect(repaired).toEqual({ anchorDay: 31, nextRunDate: midnight('2026-08-31') });
  });

  it('marks a rule that has never run with its own day', () => {
    expect(
      repairRecurringSchedule({
        nextRunDate: midnight('2026-03-31'),
        recurrencePattern: 'monthly',
        recurrenceInterval: 1,
        runDates: [],
      }),
    ).toEqual({ anchorDay: 31, nextRunDate: midnight('2026-03-31') });
  });

  it('only marks a weekly or daily rule, leaving its date alone', () => {
    const history = legacyHistory(midnight('2026-01-31'), 'weekly', 1, 3);
    expect(
      repairRecurringSchedule({
        ...history,
        recurrencePattern: 'weekly',
        recurrenceInterval: 1,
      }),
    ).toEqual({
      anchorDay: Number(dayKeyFromIsoLocal(history.nextRunDate).slice(8)),
      nextRunDate: history.nextRunDate,
    });
  });

  it('moves a weekly date an older version left on the evening before onto its own day', () => {
    // The UTC midnight a stepped day key became, and a midnight an hour off:
    // west of UTC both read as November 12 until they are moved.
    for (const nextRunDate of [
      '2026-11-13T00:00:00.000Z',
      new Date(2026, 10, 12, 23).toISOString(),
    ]) {
      const repaired = repairRecurringSchedule({
        nextRunDate,
        recurrencePattern: 'weekly',
        recurrenceInterval: 1,
        runDates: [],
      });
      expect(repaired?.anchorDay).toBe(13);
      expect(dayKeyFromIsoLocal(repaired?.nextRunDate ?? '')).toBe('2026-11-13');
    }
  });

  it('ignores runs dated after the next run date', () => {
    const history = legacyHistory(midnight('2026-01-31'), 'monthly', 1, 2);
    const repaired = repairRecurringSchedule({
      ...history,
      runDates: [...history.runDates, midnight('2027-01-01')],
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
    });
    expect(repaired).toEqual({ anchorDay: 31, nextRunDate: midnight('2026-03-31') });
  });

  it('leaves a rule whose next run date is not a date alone', () => {
    expect(
      repairRecurringSchedule({
        nextRunDate: 'not-a-date',
        recurrencePattern: 'monthly',
        recurrenceInterval: 1,
        runDates: [],
      }),
    ).toBeNull();
  });
});
