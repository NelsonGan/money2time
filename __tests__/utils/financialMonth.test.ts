import {
  addFinancialMonths,
  clampFirstDayOfMonth,
  financialMonthAnchorForToday,
  financialMonthDayKeys,
  financialMonthKeyForDate,
  financialMonthKeyForIso,
  financialMonthOffsetForDayKey,
  financialMonthRange,
  financialMonthStartDate,
  MAX_FIRST_DAY_OF_MONTH,
} from '~/utils/financialMonth';
import {
  addMonthsAtMonthStart,
  dayKeyFromDateLocal,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
  startOfMonthDate,
} from '~/utils/formatters';

describe('clampFirstDayOfMonth', () => {
  it('defaults invalid input to 1', () => {
    expect(clampFirstDayOfMonth(undefined)).toBe(1);
    expect(clampFirstDayOfMonth(null)).toBe(1);
    expect(clampFirstDayOfMonth(NaN)).toBe(1);
    expect(clampFirstDayOfMonth(3.5)).toBe(1);
  });

  it('clamps to the 1..31 range', () => {
    expect(clampFirstDayOfMonth(0)).toBe(1);
    expect(clampFirstDayOfMonth(-5)).toBe(1);
    expect(clampFirstDayOfMonth(32)).toBe(MAX_FIRST_DAY_OF_MONTH);
    expect(clampFirstDayOfMonth(100)).toBe(MAX_FIRST_DAY_OF_MONTH);
    expect(clampFirstDayOfMonth(31)).toBe(31);
    expect(clampFirstDayOfMonth(25)).toBe(25);
  });
});

describe('financialMonth — identity at firstDay = 1', () => {
  const sampleDates = [
    new Date(2025, 0, 1),
    new Date(2025, 0, 31),
    new Date(2024, 1, 29), // leap day
    new Date(2025, 6, 15),
    new Date(2025, 11, 31),
  ];

  it('financialMonthKeyForDate matches monthKeyFromDateLocal', () => {
    for (const date of sampleDates) {
      expect(financialMonthKeyForDate(date, 1)).toBe(monthKeyFromDateLocal(date));
    }
  });

  it('financialMonthKeyForIso matches monthKeyFromIsoLocal', () => {
    const isoSamples = ['2025-01-01', '2025-07-15', '2025-12-31', '2024-02-29'];
    for (const iso of isoSamples) {
      expect(financialMonthKeyForIso(iso, 1)).toBe(monthKeyFromIsoLocal(iso));
    }
  });

  it('financialMonthStartDate matches the 1st of the month', () => {
    expect(financialMonthStartDate('2025-07', 1)).toEqual(new Date(2025, 6, 1));
  });

  it('addFinancialMonths matches addMonthsAtMonthStart from a month start', () => {
    const anchor = startOfMonthDate(new Date(2025, 6, 1));
    for (const offset of [-13, -1, 0, 1, 5, 18]) {
      expect(addFinancialMonths(anchor, offset, 1)).toEqual(addMonthsAtMonthStart(anchor, offset));
    }
  });

  it('financialMonthDayKeys is the full calendar month', () => {
    expect(financialMonthDayKeys('2025-02', 1)).toEqual(
      Array.from({ length: 28 }, (_, i) => `2025-02-${String(i + 1).padStart(2, '0')}`),
    );
    expect(financialMonthDayKeys('2024-02', 1)).toHaveLength(29); // leap
    expect(financialMonthDayKeys('2025-04', 1)).toHaveLength(30);
    expect(financialMonthDayKeys('2025-01', 1)).toHaveLength(31);
  });
});

describe('financialMonthKeyForDate — shifted (firstDay = 25)', () => {
  it('assigns days >= 25 to the current month', () => {
    expect(financialMonthKeyForDate(new Date(2025, 9, 25), 25)).toBe('2025-10');
    expect(financialMonthKeyForDate(new Date(2025, 9, 31), 25)).toBe('2025-10');
  });

  it('assigns days < 25 to the previous month', () => {
    expect(financialMonthKeyForDate(new Date(2025, 9, 24), 25)).toBe('2025-09');
    expect(financialMonthKeyForDate(new Date(2025, 9, 1), 25)).toBe('2025-09');
  });

  it('rolls the year backwards across January', () => {
    expect(financialMonthKeyForDate(new Date(2025, 0, 10), 25)).toBe('2024-12');
    expect(financialMonthKeyForDate(new Date(2025, 0, 25), 25)).toBe('2025-01');
  });
});

describe('financialMonthKeyForIso — shifted (firstDay = 25)', () => {
  it('handles simple day keys without timezone drift', () => {
    expect(financialMonthKeyForIso('2025-10-24', 25)).toBe('2025-09');
    expect(financialMonthKeyForIso('2025-10-25', 25)).toBe('2025-10');
    expect(financialMonthKeyForIso('2025-01-05', 25)).toBe('2024-12');
  });

  it('falls back through Date parsing for full ISO timestamps', () => {
    const iso = new Date(2025, 9, 24, 12, 0, 0).toISOString();
    expect(financialMonthKeyForIso(iso, 25)).toBe('2025-09');
  });
});

describe('financialMonthRange / financialMonthStartDate — shifted', () => {
  it('spans day D to the day before next D', () => {
    const { start, endInclusive } = financialMonthRange('2025-10', 25);
    expect(start).toEqual(new Date(2025, 9, 25));
    expect(endInclusive).toEqual(new Date(2025, 10, 24));
  });

  it('handles the December -> January boundary', () => {
    const { start, endInclusive } = financialMonthRange('2025-12', 25);
    expect(start).toEqual(new Date(2025, 11, 25));
    expect(endInclusive).toEqual(new Date(2026, 0, 24));
  });

  it('handles a day-28 start over February', () => {
    const { start, endInclusive } = financialMonthRange('2025-02', 28);
    expect(start).toEqual(new Date(2025, 1, 28));
    expect(endInclusive).toEqual(new Date(2025, 2, 27));
  });
});

describe('financialMonthDayKeys — shifted (firstDay = 25)', () => {
  it('lists days spanning two calendar months', () => {
    const keys = financialMonthDayKeys('2025-10', 25);
    expect(keys[0]).toBe('2025-10-25');
    expect(keys[keys.length - 1]).toBe('2025-11-24');
    expect(keys).toContain('2025-10-31');
    expect(keys).toContain('2025-11-01');
    // Oct 25..31 (7) + Nov 1..24 (24)
    expect(keys).toHaveLength(31);
  });

  it('produces contiguous, unique day keys', () => {
    const keys = financialMonthDayKeys('2025-02', 25);
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < keys.length; i += 1) {
      const prev = new Date(`${keys[i - 1]}T00:00:00`);
      const cur = new Date(`${keys[i]}T00:00:00`);
      expect(cur.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});

describe('addFinancialMonths — shifted (firstDay = 25)', () => {
  it('steps whole cycles forward and back', () => {
    const start = financialMonthStartDate('2025-10', 25); // Oct 25
    expect(financialMonthKeyForDate(addFinancialMonths(start, 1, 25), 25)).toBe('2025-11');
    expect(financialMonthKeyForDate(addFinancialMonths(start, -1, 25), 25)).toBe('2025-09');
    expect(financialMonthKeyForDate(addFinancialMonths(start, 3, 25), 25)).toBe('2026-01');
  });

  it('derives the cycle from any day in the period', () => {
    const midCycle = new Date(2025, 10, 10); // Nov 10 -> belongs to 2025-10 cycle
    expect(financialMonthKeyForDate(addFinancialMonths(midCycle, 1, 25), 25)).toBe('2025-11');
  });
});

describe('financialMonthOffsetForDayKey', () => {
  it('returns 0 for a day in the anchor cycle', () => {
    expect(financialMonthOffsetForDayKey('2025-10', '2025-11-24', 25)).toBe(0);
    expect(financialMonthOffsetForDayKey('2025-10', '2025-10-25', 25)).toBe(0);
  });

  it('counts whole cycles away', () => {
    expect(financialMonthOffsetForDayKey('2025-10', '2025-11-25', 25)).toBe(1);
    expect(financialMonthOffsetForDayKey('2025-10', '2025-09-30', 25)).toBe(-1);
    expect(financialMonthOffsetForDayKey('2025-10', '2026-01-10', 25)).toBe(2);
  });

  it('returns null on a malformed day key', () => {
    expect(financialMonthOffsetForDayKey('2025-10', 'not-a-date', 25)).toBeNull();
  });

  it('matches calendar month math at firstDay = 1', () => {
    expect(financialMonthOffsetForDayKey('2025-10', '2025-12-15', 1)).toBe(2);
    expect(financialMonthOffsetForDayKey('2025-10', '2025-08-01', 1)).toBe(-2);
  });
});

describe('financialMonthAnchorForToday', () => {
  it('returns a start date whose day-of-month is the configured first day', () => {
    expect(financialMonthAnchorForToday(25).getDate()).toBe(25);
    expect(financialMonthAnchorForToday(1).getDate()).toBe(1);
  });

  it('returns the calendar month start at firstDay = 1', () => {
    const anchor = financialMonthAnchorForToday(1);
    expect(dayKeyFromDateLocal(anchor)).toBe(dayKeyFromDateLocal(startOfMonthDate(new Date())));
  });
});
