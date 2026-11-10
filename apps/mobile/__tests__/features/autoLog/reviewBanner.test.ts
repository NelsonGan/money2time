import { isReviewBannerVisible } from '~/features/autoLog/lib/presentation';

describe('isReviewBannerVisible', () => {
  it('hides with nothing to show', () => {
    expect(isReviewBannerVisible(0, [], [], null)).toBe(false);
  });

  it('shows pending items and auto-review results', () => {
    expect(isReviewBannerVisible(0, ['a'], [], null)).toBe(true);
    expect(isReviewBannerVisible(0, [], ['b'], null)).toBe(true);
  });

  it('stays hidden for what X cleared', () => {
    expect(isReviewBannerVisible(0, ['a'], ['b'], new Set(['a', 'b']))).toBe(false);
  });

  it('comes back for a notification that arrived after X', () => {
    expect(isReviewBannerVisible(0, ['a', 'c'], [], new Set(['a']))).toBe(true);
  });

  it('always shows a review run in progress', () => {
    expect(isReviewBannerVisible(2, [], [], new Set(['a']))).toBe(true);
  });
});
