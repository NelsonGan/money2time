import { inProgressLabel, periodPillLabel, periodTitle } from '~/features/review/lib/reviewFormat';
import { currentPeriod, lastCompletedPeriod } from '~/features/review/lib/reviewPeriods';

// Friday 9 Oct 2026.
const TODAY = new Date(2026, 9, 9);

describe('review period labels', () => {
  const month = (monthCycle: number) =>
    lastCompletedPeriod({ zoom: 'month', today: TODAY, weekStartsOn: 1, monthCycle });

  it('names a calendar month by its month', () => {
    expect(periodPillLabel(month(1), 'en-US')).toBe('Sep');
    expect(periodTitle(month(1), 'en-US')).toMatch(/September 2026/);
  });

  it('shows the dates of a cycle that does not line up with the calendar', () => {
    // A cycle starting on the 31st: the one that just ended is 31 Aug to 29 Sep.
    expect(periodPillLabel(month(31), 'en-US')).toBe('Aug 31 – Sep 29');
    expect(periodTitle(month(31), 'en-US')).toBe('Aug 31 to Sep 29');
  });

  it('keeps years by their number', () => {
    const year = lastCompletedPeriod({
      zoom: 'year',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 31,
    });
    expect(periodPillLabel(year, 'en-US')).toBe('2025');
    expect(periodTitle(year, 'en-US')).toBe('2025');
  });

  it('says when the running period ends', () => {
    const running = currentPeriod({ zoom: 'month', today: TODAY, weekStartsOn: 1, monthCycle: 31 });
    expect(inProgressLabel(running, 'en-US')).toBe('In progress, ends Oct 30');
  });
});
