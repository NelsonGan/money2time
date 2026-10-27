import { ringAtDistance } from '~/features/budget/lib/budgetRings';

describe('ringAtDistance', () => {
  // size 280: year ring radius 132.5, month 112.5, week 92.5 (stroke 15, gap 5).
  const all = ['year', 'month', 'week'] as const;

  it('finds the ring under a tap, outermost the year', () => {
    expect(ringAtDistance(133, 280, [...all])).toBe('year');
    expect(ringAtDistance(112, 280, [...all])).toBe('month');
    expect(ringAtDistance(90, 280, [...all])).toBe('week');
  });

  it('ignores the centre, the outside and rings not drawn', () => {
    expect(ringAtDistance(40, 280, [...all])).toBeNull();
    expect(ringAtDistance(150, 280, [...all])).toBeNull();
    expect(ringAtDistance(133, 280, ['month', 'week'])).toBeNull();
  });
});
