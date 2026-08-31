import type { MonthCycle } from '~/types';
import { dayKeyFromDateLocal, monthKeyFromIsoLocal } from '~/utils/formatters';
import {
  addFinancialMonths,
  buildMonthCycle,
  financialMonthDayKeys,
  financialMonthKeyForDate,
  financialMonthKeyForIso,
  financialMonthOffsetForDayKey,
  financialMonthRange,
  financialMonthStartDate,
  firstDayForMonthKey,
  monthCycleDefaultDay,
  monthCycleOf,
  monthCycleOverrideCount,
  parseMonthCycleOverrides,
  serializeMonthCycleOverrides,
  withMonthCycleDefaultDay,
  withMonthCycleOverride,
  withoutMonthCycleOverrides,
} from '~/utils/financialMonth';

const cycle = (defaultDay: number, overrides: Record<string, number> = {}): MonthCycle => ({
  defaultDay,
  overrides,
});

function dayKey(year: number, month1: number, day: number): string {
  return dayKeyFromDateLocal(new Date(year, month1 - 1, day));
}

describe('parseMonthCycleOverrides', () => {
  it('reads a well-formed blob', () => {
    expect(parseMonthCycleOverrides('{"2026-03":15,"2026-12":2}')).toEqual({
      '2026-03': 15,
      '2026-12': 2,
    });
  });

  it('degrades to no overrides rather than throwing on junk', () => {
    expect(parseMonthCycleOverrides(null)).toEqual({});
    expect(parseMonthCycleOverrides('')).toEqual({});
    expect(parseMonthCycleOverrides('not json')).toEqual({});
    expect(parseMonthCycleOverrides('[1,2,3]')).toEqual({});
    expect(parseMonthCycleOverrides('"a string"')).toEqual({});
  });

  it('drops entries a month cycle could not honour', () => {
    const parsed = parseMonthCycleOverrides(
      '{"2026-13":5,"2026-3":5,"nope":5,"2026-04":0,"2026-05":29,"2026-06":"7","2026-07":7.5,"2026-08":8}',
    );
    expect(parsed).toEqual({ '2026-08': 8 });
  });
});

describe('serializeMonthCycleOverrides', () => {
  it('writes null for an empty set so the column stays clean', () => {
    expect(serializeMonthCycleOverrides({})).toBeNull();
  });

  it('writes keys in order so an unchanged set produces an unchanged blob', () => {
    expect(serializeMonthCycleOverrides({ '2026-12': 2, '2026-03': 15 })).toBe(
      '{"2026-03":15,"2026-12":2}',
    );
  });

  it('round-trips through the parser', () => {
    const overrides = { '2026-03': 15, '2027-01': 28 };
    expect(parseMonthCycleOverrides(serializeMonthCycleOverrides(overrides))).toEqual(overrides);
  });
});

describe('editing a cycle', () => {
  it('sets a single month without touching the rest', () => {
    const next = withMonthCycleOverride(cycle(25), '2026-03', 15);
    expect(next).toEqual(cycle(25, { '2026-03': 15 }));
    expect(firstDayForMonthKey(next, '2026-03')).toBe(15);
    expect(firstDayForMonthKey(next, '2026-04')).toBe(25);
  });

  it('clears an override with null', () => {
    const next = withMonthCycleOverride(cycle(25, { '2026-03': 15 }), '2026-03', null);
    expect(monthCycleOverrideCount(next)).toBe(0);
  });

  it('stores no override for a day that already matches the default', () => {
    // "Customized" has to mean "differs from the default", or a month put back
    // on the default would stop following a later change of default.
    const next = withMonthCycleOverride(cycle(25, { '2026-03': 15 }), '2026-03', 25);
    expect(next.overrides).toEqual({});
  });

  it('keeps every pinned month when the default moves under it', () => {
    // The mirror of the rule above would forget March here, and moving the
    // default back would not bring it back. The default moving is not the user
    // saying anything about March.
    const next = withMonthCycleDefaultDay(cycle(25, { '2026-03': 15, '2026-04': 20 }), 15);
    expect(next).toEqual(cycle(15, { '2026-03': 15, '2026-04': 20 }));
    expect(withMonthCycleDefaultDay(next, 25)).toEqual(cycle(25, { '2026-03': 15, '2026-04': 20 }));
  });

  it('clears every override at once', () => {
    expect(withoutMonthCycleOverrides(cycle(25, { '2026-03': 15 }))).toEqual(cycle(25));
  });

  it('clamps a day outside 1..28 rather than storing one no month has', () => {
    expect(withMonthCycleOverride(cycle(1), '2026-03', 31).overrides['2026-03']).toBe(28);
    expect(monthCycleDefaultDay(cycle(0))).toBe(1);
  });
});

describe('monthCycleOf', () => {
  const settings = { firstDayOfMonth: 25, firstDayOverridesJson: '{"2026-03":15}' };

  it('combines the two stored columns', () => {
    expect(monthCycleOf(settings)).toEqual(cycle(25, { '2026-03': 15 }));
  });

  it('hands back the same object for the same settings, so memos hold', () => {
    expect(monthCycleOf(settings)).toBe(monthCycleOf(settings));
  });

  it('rebuilds when the settings object reports different columns', () => {
    const mutable = { firstDayOfMonth: 25, firstDayOverridesJson: null as string | null };
    const first = monthCycleOf(mutable);
    mutable.firstDayOverridesJson = '{"2026-03":15}';
    const second = monthCycleOf(mutable);
    expect(second).not.toBe(first);
    expect(second.overrides).toEqual({ '2026-03': 15 });
  });

  it('hands the same cycle to a DIFFERENT settings object with the same columns', () => {
    // The point of interning by value: every settings refresh replaces the
    // settings object, and memos keyed on the cycle must survive that.
    const reread = { firstDayOfMonth: 25, firstDayOverridesJson: '{"2026-03":15}' };
    expect(monthCycleOf(reread)).toBe(monthCycleOf(settings));
  });

  it('does not let two settings objects thrash each other', () => {
    const other = { firstDayOfMonth: 1, firstDayOverridesJson: null };
    const a = monthCycleOf(settings);
    monthCycleOf(other);
    expect(monthCycleOf(settings)).toBe(a);
  });
});

describe('an overridden month', () => {
  // March starts on the 15th; every other month starts on the 25th.
  const mixed = cycle(25, { '2026-03': 15 });

  it('labels a day by the cycle its own calendar month starts', () => {
    // Mar 14 is before March's own start, so it is still February's cycle.
    expect(financialMonthKeyForIso(dayKey(2026, 3, 14), mixed)).toBe('2026-02');
    expect(financialMonthKeyForIso(dayKey(2026, 3, 15), mixed)).toBe('2026-03');
    // April is back on the 25th, so Apr 24 still belongs to March.
    expect(financialMonthKeyForIso(dayKey(2026, 4, 24), mixed)).toBe('2026-03');
    expect(financialMonthKeyForIso(dayKey(2026, 4, 25), mixed)).toBe('2026-04');
  });

  it('lends the days to its neighbour rather than leaving a gap', () => {
    const february = financialMonthRange('2026-02', mixed);
    expect(dayKeyFromDateLocal(february.start)).toBe(dayKey(2026, 2, 25));
    expect(dayKeyFromDateLocal(february.endInclusive)).toBe(dayKey(2026, 3, 14));

    const march = financialMonthRange('2026-03', mixed);
    expect(dayKeyFromDateLocal(march.start)).toBe(dayKey(2026, 3, 15));
    expect(dayKeyFromDateLocal(march.endInclusive)).toBe(dayKey(2026, 4, 24));
  });

  it('starts on its own day when stepped onto', () => {
    const fromJanuary = new Date(2026, 0, 26);
    expect(dayKeyFromDateLocal(addFinancialMonths(fromJanuary, 2, mixed))).toBe(
      dayKey(2026, 3, 15),
    );
    expect(dayKeyFromDateLocal(addFinancialMonths(fromJanuary, 3, mixed))).toBe(
      dayKey(2026, 4, 25),
    );
  });

  it('spans the days its range covers', () => {
    // Mar 15 to Apr 24 inclusive is 41 days, longer than any calendar month.
    expect(financialMonthDayKeys('2026-03', mixed)).toHaveLength(41);
    expect(financialMonthDayKeys('2026-02', mixed)).toHaveLength(18);
  });

  it('still counts whole months when measuring an offset', () => {
    expect(financialMonthOffsetForDayKey('2026-01', dayKey(2026, 3, 14), mixed)).toBe(1);
    expect(financialMonthOffsetForDayKey('2026-01', dayKey(2026, 3, 15), mixed)).toBe(2);
  });
});

describe('the cycles tile the calendar', () => {
  // A deliberately awkward year: a default, a month pulled forward, a month
  // pushed back, a December start, and a January that follows the default.
  const messy = cycle(25, {
    '2026-03': 15,
    '2026-07': 28,
    '2026-08': 1,
    '2026-12': 20,
  });

  it('puts every day of the year in exactly the range of the month it names', () => {
    const cursor = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    while (cursor.getTime() <= end.getTime()) {
      const key = dayKeyFromDateLocal(cursor);
      const monthKey = financialMonthKeyForIso(key, messy);
      const { start, endInclusive } = financialMonthRange(monthKey, messy);
      expect(dayKeyFromDateLocal(start) <= key).toBe(true);
      expect(key <= dayKeyFromDateLocal(endInclusive)).toBe(true);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  it('leaves no day between one cycle ending and the next beginning', () => {
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `2026-${String(month).padStart(2, '0')}`;
      const { endInclusive } = financialMonthRange(monthKey, messy);
      const nextKey = month === 12 ? '2027-01' : `2026-${String(month + 1).padStart(2, '0')}`;
      const nextStart = financialMonthStartDate(nextKey, messy);
      const dayAfterEnd = new Date(
        endInclusive.getFullYear(),
        endInclusive.getMonth(),
        endInclusive.getDate() + 1,
      );
      expect(dayKeyFromDateLocal(dayAfterEnd)).toBe(dayKeyFromDateLocal(nextStart));
    }
  });
});

describe('a plain day-1 cycle is the calendar month', () => {
  const plain = buildMonthCycle(1, null);

  it('matches the bare number and the calendar-month helper', () => {
    const days = ['2026-01-01', '2026-02-28', '2026-06-15', '2026-12-31'];
    for (const day of days) {
      expect(financialMonthKeyForIso(day, plain)).toBe(monthKeyFromIsoLocal(day));
      expect(financialMonthKeyForIso(day, plain)).toBe(financialMonthKeyForIso(day, 1));
      expect(financialMonthKeyForIso(day, plain)).toBe(financialMonthKeyForIso(day));
    }
  });

  it('ranges a whole calendar month, February included', () => {
    const february = financialMonthRange('2026-02', plain);
    expect(dayKeyFromDateLocal(february.start)).toBe(dayKey(2026, 2, 1));
    expect(dayKeyFromDateLocal(february.endInclusive)).toBe(dayKey(2026, 2, 28));
    expect(financialMonthDayKeys('2026-02', plain)).toEqual(financialMonthDayKeys('2026-02', 1));
  });

  it('reads the same as day 1 for a local Date', () => {
    const date = new Date(2026, 6, 4, 23, 30);
    expect(financialMonthKeyForDate(date, plain)).toBe(financialMonthKeyForDate(date, 1));
  });
});
