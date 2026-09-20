jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

import { offscreenPageLimitFor } from '~/hooks/usePagerTabSync';

/**
 * Regression guard for Sentry MONEY2TIME-1Y ("Scrapped or attached views may
 * not be recycled"), a fatal Android crash.
 *
 * ViewPager2 only reaches the crashing recycle path because its RecyclerView
 * is free to recycle a page mid-fling. Covering every page with
 * `offscreenPageLimit` keeps them all attached, so there is nothing to
 * recycle. The value must therefore be at least `pageCount - 1` for the
 * pagers this app actually renders, and never below 1, which ViewPager2
 * rejects outright.
 */
describe('offscreenPageLimitFor', () => {
  it('keeps every page of a real pager attached', () => {
    // The page counts of the three <PagerView>s in the app: the add/split
    // sheet, Settle Up's two tabs, and the transaction editor's type cards.
    for (const pageCount of [2, 2, 3, 4]) {
      expect(offscreenPageLimitFor(pageCount)).toBeGreaterThanOrEqual(pageCount - 1);
    }
  });

  it('never returns a limit ViewPager2 would reject', () => {
    // ViewPager2 throws IllegalArgumentException below 1, so degenerate page
    // counts (a pager rendered before its children resolve) must still floor.
    for (const pageCount of [0, 1, 2]) {
      expect(offscreenPageLimitFor(pageCount)).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not hold more pages than the pager has', () => {
    // Holding every page is the point, but asking for more than exist would
    // be a pointless over-allocation on a large pager.
    expect(offscreenPageLimitFor(4)).toBe(3);
    expect(offscreenPageLimitFor(2)).toBe(1);
  });
});
