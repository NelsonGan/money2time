jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  FLOATING_NAV_HEIGHT,
  getFloatingNavBottomGap,
  getFloatingNavReservedInset,
  getSideRailFootGap,
} from '~/components/navigation/floatingNav';

describe('getFloatingNavReservedInset', () => {
  it('clears the floating bottom bar by default', () => {
    expect(getFloatingNavReservedInset(34)).toBe(
      getFloatingNavBottomGap(34) + FLOATING_NAV_HEIGHT + 10,
    );
    expect(getFloatingNavReservedInset(34, 'bottom')).toBe(getFloatingNavReservedInset(34));
  });

  it('clears only the home indicator beside the side rail', () => {
    expect(getFloatingNavReservedInset(34, 'side')).toBe(getSideRailFootGap(34) + 10);
    expect(getFloatingNavReservedInset(34, 'side')).toBeLessThan(getFloatingNavReservedInset(34));
  });

  it('keeps the rail foot off the bottom edge without a home indicator', () => {
    expect(getSideRailFootGap(0)).toBe(12);
  });
});
