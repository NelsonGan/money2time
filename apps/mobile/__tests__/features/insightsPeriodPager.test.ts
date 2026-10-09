import { getPeriodPagerCommitSteps } from '~/features/insights/lib/periodPager';

describe('insights period pager commits', () => {
  it('preserves every month when callbacks arrive before another render', () => {
    const renderedIndex = 2400;
    const renderedMonth = 9; // October, using the same date snapshot for all callbacks.
    let committedIndex = renderedIndex;
    const months: number[] = [];

    for (const targetIndex of [2399, 2398, 2397]) {
      const steps = getPeriodPagerCommitSteps({ renderedIndex, committedIndex, targetIndex });
      expect(steps).not.toBeNull();
      months.push(renderedMonth + steps!);
      committedIndex = targetIndex;
    }

    expect(months).toEqual([8, 7, 6]); // September, August, July.
  });

  it('restores the rendered month when a pending swipe reverses back to it', () => {
    expect(
      getPeriodPagerCommitSteps({ renderedIndex: 2400, committedIndex: 2399, targetIndex: 2400 }),
    ).toBe(0);
  });

  it('ignores duplicate drag and momentum callbacks for the committed page', () => {
    expect(
      getPeriodPagerCommitSteps({ renderedIndex: 2400, committedIndex: 2399, targetIndex: 2399 }),
    ).toBeNull();
  });

  it('uses the new date snapshot after rendering the previous commit', () => {
    expect(
      getPeriodPagerCommitSteps({ renderedIndex: 2398, committedIndex: 2398, targetIndex: 2397 }),
    ).toBe(-1);
  });

  it('preserves skipped pages and direction changes before rendering', () => {
    expect(
      getPeriodPagerCommitSteps({ renderedIndex: 2400, committedIndex: 2397, targetIndex: 2402 }),
    ).toBe(2);
  });
});
