import {
  clampYearMonth,
  monthsBetween,
  shiftYearMonth,
  yearMonthFromKey,
  yearMonthToKey,
} from '~/components/datePicker/monthJump';

describe('monthJump', () => {
  it('counts the pages between two months, across years', () => {
    // The reported case: October 2026 back to January 2026 is 9 swipes.
    expect(monthsBetween({ year: 2026, monthIndex: 9 }, { year: 2026, monthIndex: 0 })).toBe(-9);
    expect(monthsBetween({ year: 2025, monthIndex: 11 }, { year: 2027, monthIndex: 1 })).toBe(14);
  });

  it('shifts across year boundaries in both directions', () => {
    expect(shiftYearMonth({ year: 2026, monthIndex: 0 }, -1)).toEqual({
      year: 2025,
      monthIndex: 11,
    });
    expect(shiftYearMonth({ year: 2026, monthIndex: 11 }, 13)).toEqual({
      year: 2028,
      monthIndex: 0,
    });
    expect(shiftYearMonth({ year: 2026, monthIndex: 3 }, -27)).toEqual({
      year: 2024,
      monthIndex: 0,
    });
  });

  it('round-trips month keys', () => {
    expect(yearMonthFromKey('2026-01')).toEqual({ year: 2026, monthIndex: 0 });
    expect(yearMonthToKey({ year: 2026, monthIndex: 11 })).toBe('2026-12');
  });

  it('clamps into the pickable range', () => {
    const min = { year: 2024, monthIndex: 5 };
    const max = { year: 2026, monthIndex: 2 };
    expect(clampYearMonth({ year: 2024, monthIndex: 0 }, min, max)).toEqual(min);
    expect(clampYearMonth({ year: 2027, monthIndex: 0 }, min, max)).toEqual(max);
    expect(clampYearMonth({ year: 2025, monthIndex: 7 }, min, max)).toEqual({
      year: 2025,
      monthIndex: 7,
    });
    expect(clampYearMonth({ year: 1990, monthIndex: 0 })).toEqual({ year: 1990, monthIndex: 0 });
  });
});
