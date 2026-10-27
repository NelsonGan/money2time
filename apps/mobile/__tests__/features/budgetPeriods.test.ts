import {
  addBudgetPeriods,
  budgetCoveringDay,
  budgetDaysLeft,
  budgetPeriodKeyForDate,
  budgetPeriodRange,
  budgetSlotKey,
  budgetWeekOverlaps,
  isBudgetPeriodKey,
  isIsoInBudgetRange,
} from '~/features/budget/lib/budgetPeriods';
import { budgetPeriodLabel } from '~/features/budget/lib/format';

const MONDAY = { weekStartsOn: 1 as const, monthCycle: 1 };
const SUNDAY = { weekStartsOn: 0 as const, monthCycle: 1 };

describe('budgetPeriodKeyForDate', () => {
  const wednesday = new Date(2026, 9, 28); // Wed 28 Oct 2026

  it('keys a week by its first day under the chosen first weekday', () => {
    expect(budgetPeriodKeyForDate('week', wednesday, MONDAY)).toBe('2026-10-26');
    expect(budgetPeriodKeyForDate('week', wednesday, SUNDAY)).toBe('2026-10-25');
  });

  it('keys a week across a month and year boundary', () => {
    expect(budgetPeriodKeyForDate('week', new Date(2027, 0, 2), MONDAY)).toBe('2026-12-28');
  });

  it('keys a month by the financial month and a year by the calendar year', () => {
    expect(budgetPeriodKeyForDate('month', wednesday, MONDAY)).toBe('2026-10');
    expect(budgetPeriodKeyForDate('month', wednesday, { ...MONDAY, monthCycle: 29 })).toBe(
      '2026-09',
    );
    expect(budgetPeriodKeyForDate('year', wednesday, { ...MONDAY, monthCycle: 29 })).toBe('2026');
  });
});

describe('budgetPeriodRange', () => {
  it('covers a week from its key day for seven days', () => {
    expect(budgetPeriodRange('week', '2026-10-26', 1)).toEqual({
      start: '2026-10-26',
      end: '2026-11-01',
    });
  });

  it('follows the month cycle for a month', () => {
    expect(budgetPeriodRange('month', '2026-10', 25)).toEqual({
      start: '2026-10-25',
      end: '2026-11-24',
    });
  });

  it('covers January to December for a year', () => {
    expect(budgetPeriodRange('year', '2026', 25)).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });
});

describe('addBudgetPeriods', () => {
  it('steps weeks, months and years both ways', () => {
    expect(addBudgetPeriods('week', '2026-12-28', 1, 1)).toBe('2027-01-04');
    expect(addBudgetPeriods('week', '2026-10-26', -2, 1)).toBe('2026-10-12');
    expect(addBudgetPeriods('month', '2026-12', 1, 1)).toBe('2027-01');
    expect(addBudgetPeriods('year', '2026', -1, 1)).toBe('2025');
  });
});

describe('budgetSlotKey', () => {
  it('moves a week made under another first weekday onto the current layout', () => {
    expect(budgetSlotKey('week', '2026-10-25', 1)).toBe('2026-10-19'); // a Sunday
    expect(budgetSlotKey('week', '2026-10-26', 1)).toBe('2026-10-26');
    expect(budgetSlotKey('month', '2026-10', 1)).toBe('2026-10');
  });
});

describe('isIsoInBudgetRange', () => {
  const range = { start: '2026-10-26', end: '2026-11-01' };

  it('includes both ends and reads ISO timestamps as local days', () => {
    expect(isIsoInBudgetRange('2026-10-26', range)).toBe(true);
    expect(isIsoInBudgetRange('2026-11-01', range)).toBe(true);
    expect(isIsoInBudgetRange('2026-11-02', range)).toBe(false);
    expect(isIsoInBudgetRange(new Date(2026, 9, 25, 23, 30).toISOString(), range)).toBe(false);
  });
});

describe('budgetDaysLeft', () => {
  const range = { start: '2026-10-26', end: '2026-11-01' };

  it('counts today and the days after it', () => {
    expect(budgetDaysLeft(range, new Date(2026, 9, 26, 9))).toBe(7);
    expect(budgetDaysLeft(range, new Date(2026, 10, 1, 23))).toBe(1);
    expect(budgetDaysLeft(range, new Date(2026, 10, 2))).toBe(0);
  });
});

describe('isBudgetPeriodKey', () => {
  it('accepts only the key shape of its period', () => {
    expect(isBudgetPeriodKey('week', '2026-10-26')).toBe(true);
    expect(isBudgetPeriodKey('week', '2026-10')).toBe(false);
    expect(isBudgetPeriodKey('month', '2026-10')).toBe(true);
    expect(isBudgetPeriodKey('year', '2026')).toBe(true);
    expect(isBudgetPeriodKey('year', '2026-10')).toBe(false);
  });
});

describe('budgetWeekOverlaps', () => {
  it('is true for a week sharing any day, false for one that only touches', () => {
    // Sunday 25 Oct – Saturday 31 Oct against Monday-start weeks.
    expect(budgetWeekOverlaps('2026-10-26', ['2026-10-25'])).toBe(true);
    expect(budgetWeekOverlaps('2026-10-19', ['2026-10-25'])).toBe(true);
    expect(budgetWeekOverlaps('2026-11-02', ['2026-10-25'])).toBe(false);
    expect(budgetWeekOverlaps('2026-10-18', ['2026-10-25'])).toBe(false);
    expect(budgetWeekOverlaps('2026-10-26', [])).toBe(false);
  });

  it('counts whole days across a daylight-saving change', () => {
    // Europe and the US change clocks around these dates.
    expect(budgetWeekOverlaps('2026-03-30', ['2026-03-23'])).toBe(false);
    expect(budgetWeekOverlaps('2026-11-02', ['2026-10-26'])).toBe(false);
  });
});

describe('budgetCoveringDay', () => {
  const week = (periodKey: string) => ({ period: 'week' as const, periodKey });

  it('finds the week budget whose own seven days include the day', () => {
    // A Sunday-start week (25–31 Oct) still covers Monday 26 Oct.
    expect(budgetCoveringDay([week('2026-10-25')], 'week', '2026-10-26', 1)).toEqual(
      week('2026-10-25'),
    );
    expect(budgetCoveringDay([week('2026-10-25')], 'week', '2026-11-01', 1)).toBeNull();
  });

  it('prefers the later of two overlapping weeks and ignores other periods', () => {
    const budgets = [
      week('2026-10-19'),
      week('2026-10-25'),
      { period: 'month' as const, periodKey: '2026-10' },
    ];
    expect(budgetCoveringDay(budgets, 'week', '2026-10-25', 1)).toEqual(week('2026-10-25'));
    expect(budgetCoveringDay(budgets, 'month', '2026-10-25', 1)?.periodKey).toBe('2026-10');
    expect(budgetCoveringDay(budgets, 'year', '2026-10-25', 1)).toBeNull();
  });
});

describe('budgetPeriodLabel', () => {
  const now = new Date(2026, 9, 28);

  it('names a week of this year by its days only', () => {
    expect(budgetPeriodLabel('week', '2026-10-26', 'en-US', 1, now)).toBe('Oct 26 – Nov 1');
  });

  it('adds the years to a week outside this year or spanning two', () => {
    expect(budgetPeriodLabel('week', '2026-12-28', 'en-US', 1, now)).toBe(
      'Dec 28, 2026 – Jan 3, 2027',
    );
    expect(budgetPeriodLabel('week', '2025-10-27', 'en-US', 1, now)).toBe(
      'Oct 27, 2025 – Nov 2, 2025',
    );
  });

  it('names a year by its number', () => {
    expect(budgetPeriodLabel('year', '2026', 'en-US', 1, now)).toBe('2026');
  });
});
