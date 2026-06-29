import { computeItemStats, daysBetweenDayKeys } from '~/features/items/utils';
import type { Item } from '~/types';

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: 'i1',
    name: 'Espresso machine',
    iconId: null,
    purchasePrice: 365,
    currency: 'USD',
    purchaseDate: '2024-01-01',
    endDate: null,
    salePrice: null,
    note: null,
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('daysBetweenDayKeys', () => {
  it('counts whole days between two keys', () => {
    expect(daysBetweenDayKeys('2024-01-01', '2024-01-11')).toBe(10);
  });

  it('returns 0 for same day or inverted ranges', () => {
    expect(daysBetweenDayKeys('2024-01-01', '2024-01-01')).toBe(0);
    expect(daysBetweenDayKeys('2024-02-01', '2024-01-01')).toBe(0);
  });

  it('spans a daylight-saving boundary without drift', () => {
    // US DST began 2024-03-10. UTC math keeps the count exact.
    expect(daysBetweenDayKeys('2024-03-09', '2024-03-12')).toBe(3);
  });
});

describe('computeItemStats', () => {
  it('amortizes price across days owned for an active item', () => {
    const stats = computeItemStats(makeItem({ purchasePrice: 365 }), '2024-12-31', 0);
    expect(stats.isActive).toBe(true);
    expect(stats.daysOwned).toBe(365);
    expect(stats.netCost).toBe(365);
    expect(stats.dailyCost).toBeCloseTo(1, 5);
    expect(stats.dailyWorkHours).toBeNull();
  });

  it('clamps a same-day purchase to one day (no divide by zero)', () => {
    const stats = computeItemStats(makeItem({ purchasePrice: 50 }), '2024-01-01', 0);
    expect(stats.daysOwned).toBe(1);
    expect(stats.dailyCost).toBe(50);
  });

  it('freezes day-counting at the end date for an inactive item', () => {
    const stats = computeItemStats(
      makeItem({ purchasePrice: 100, endDate: '2024-01-11' }),
      '2024-12-31',
      0,
    );
    expect(stats.isActive).toBe(false);
    expect(stats.daysOwned).toBe(10);
    expect(stats.dailyCost).toBeCloseTo(10, 5);
  });

  it('subtracts sale price to get net cost over the item lifetime', () => {
    const stats = computeItemStats(
      makeItem({ purchasePrice: 100, salePrice: 40, endDate: '2024-01-11' }),
      '2024-12-31',
      0,
    );
    expect(stats.netCost).toBe(60);
    expect(stats.dailyCost).toBeCloseTo(6, 5);
  });

  it('derives daily work-time from the hourly rate', () => {
    // $20/day at $10/hour = 2 hours of work per day.
    const stats = computeItemStats(makeItem({ purchasePrice: 20 }), '2024-01-02', 10);
    expect(stats.daysOwned).toBe(1);
    expect(stats.dailyWorkHours).toBeCloseTo(2, 5);
  });

  it('converts a foreign-currency daily cost before applying the hourly rate', () => {
    // 2000 (foreign) / day, FX 0.01 → 20 reporting / day at 10/hour = 2 hours.
    const stats = computeItemStats(
      makeItem({ purchasePrice: 2000, currency: 'JPY' }),
      '2024-01-02',
      10,
      0.01,
    );
    expect(stats.dailyCost).toBe(2000); // stays in the item's own currency
    expect(stats.dailyWorkHours).toBeCloseTo(2, 5);
  });
});
