import { yearViewIndexForYear } from '~/features/calendar/lib/calendarBuild';

// Mirrors the year-view FlatList window in CalendarYearView.
const CENTER_INDEX = 10;
const TOTAL_SLOTS = 21; // valid indices 0..20

describe('yearViewIndexForYear', () => {
  const centerYear = 2026;

  it('maps the center year to the center index', () => {
    expect(yearViewIndexForYear(2026, centerYear, CENTER_INDEX, TOTAL_SLOTS)).toBe(10);
  });

  it('maps in-window years to their slot', () => {
    expect(yearViewIndexForYear(2016, centerYear, CENTER_INDEX, TOTAL_SLOTS)).toBe(0);
    expect(yearViewIndexForYear(2036, centerYear, CENTER_INDEX, TOTAL_SLOTS)).toBe(20);
    expect(yearViewIndexForYear(2030, centerYear, CENTER_INDEX, TOTAL_SLOTS)).toBe(14);
  });

  // MONEY2TIME-Z repro: paging to a far-past year produced index -51.
  it('clamps a far-past year to the first slot instead of a negative index', () => {
    const idx = yearViewIndexForYear(1965, centerYear, CENTER_INDEX, TOTAL_SLOTS);
    expect(idx).toBe(0);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(TOTAL_SLOTS - 1);
  });

  it('clamps a far-future year to the last slot', () => {
    expect(yearViewIndexForYear(3000, centerYear, CENTER_INDEX, TOTAL_SLOTS)).toBe(TOTAL_SLOTS - 1);
  });

  it('never returns an out-of-range index across a wide year sweep', () => {
    for (let year = 1900; year <= 2200; year++) {
      const idx = yearViewIndexForYear(year, centerYear, CENTER_INDEX, TOTAL_SLOTS);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(TOTAL_SLOTS - 1);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it('falls back to the center index for a non-finite year', () => {
    expect(yearViewIndexForYear(NaN, centerYear, CENTER_INDEX, TOTAL_SLOTS)).toBe(CENTER_INDEX);
  });
});
