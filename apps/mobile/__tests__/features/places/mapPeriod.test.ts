import {
  inPeriod,
  isLatestPeriod,
  isMapTransaction,
  periodLabel,
  periodRange,
  placeTotals,
  shiftPeriod,
} from '~/features/places/lib/mapPeriod';
import type { Transaction } from '~/types';

describe('spending map period', () => {
  const nov = { kind: 'month' as const, anchor: new Date(2026, 10, 21, 15) };

  it('spans a local month, a local year or everything', () => {
    expect(periodRange(nov)).toEqual({ start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) });
    expect(periodRange({ kind: 'year', anchor: nov.anchor })).toEqual({
      start: new Date(2026, 0, 1),
      end: new Date(2027, 0, 1),
    });
    expect(periodRange({ kind: 'all', anchor: nov.anchor })).toEqual({ start: null, end: null });
  });

  it('steps across month and year ends from the 31st without skipping a month', () => {
    const jan31 = { kind: 'month' as const, anchor: new Date(2026, 0, 31) };
    expect(shiftPeriod(jan31, 1).anchor.getMonth()).toBe(1);
    expect(
      shiftPeriod({ kind: 'month', anchor: new Date(2026, 11, 5) }, 1).anchor.getFullYear(),
    ).toBe(2027);
    expect(shiftPeriod({ kind: 'year', anchor: nov.anchor }, -1).anchor.getFullYear()).toBe(2025);
    const all = { kind: 'all' as const, anchor: nov.anchor };
    expect(shiftPeriod(all, 1)).toBe(all);
  });

  it('knows the current period is the latest', () => {
    const now = new Date(2026, 10, 21);
    expect(isLatestPeriod(nov, now)).toBe(true);
    expect(isLatestPeriod(shiftPeriod(nov, -1), now)).toBe(false);
    expect(isLatestPeriod({ kind: 'all', anchor: now }, now)).toBe(true);
  });

  it('filters by date and labels the period', () => {
    expect(inPeriod(new Date(2026, 10, 30, 23, 59).toISOString(), nov)).toBe(true);
    expect(inPeriod(new Date(2026, 11, 1).toISOString(), nov)).toBe(false);
    expect(periodLabel(nov, 'en', 'All time')).toBe('November 2026');
    expect(periodLabel({ kind: 'year', anchor: nov.anchor }, 'en', 'All time')).toBe('2026');
    expect(periodLabel({ kind: 'all', anchor: nov.anchor }, 'en', 'All time')).toBe('All time');
    expect(periodLabel(nov, 'not a locale!', 'All time')).toBe('November 2026');
  });

  it('counts expenses as spending and income apart, never transfers', () => {
    const rows = [
      { type: 'expense', amount: 10 },
      { type: 'expense', amount: -5 },
      { type: 'income', amount: 100 },
    ] as Transaction[];
    expect(placeTotals(rows, (t) => t.amount)).toEqual({ spent: 15, earned: 100, visits: 3 });
    expect(isMapTransaction({ type: 'transfer', deletedAt: null } as Transaction)).toBe(false);
    expect(isMapTransaction({ type: 'expense', deletedAt: '2026-01-01' } as Transaction)).toBe(
      false,
    );
    expect(isMapTransaction({ type: 'income', deletedAt: null } as Transaction)).toBe(true);
  });
});
