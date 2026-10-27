import { ringAtDistance } from '~/features/budget/lib/budgetRings';

describe('ringAtDistance', () => {
  // size 160: year ring radius 71.5, month 51.5, week 31.5 (stroke 17, gap 3).
  const all = ['year', 'month', 'week'] as const;

  it('finds the ring under a tap, outermost the year', () => {
    expect(ringAtDistance(72, 160, [...all])).toBe('year');
    expect(ringAtDistance(52, 160, [...all])).toBe('month');
    expect(ringAtDistance(30, 160, [...all])).toBe('week');
  });

  it('ignores the centre, the outside and rings not drawn', () => {
    expect(ringAtDistance(15, 160, [...all])).toBeNull();
    expect(ringAtDistance(85, 160, [...all])).toBeNull();
    expect(ringAtDistance(72, 160, ['month', 'week'])).toBeNull();
  });
});
