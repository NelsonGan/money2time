jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, StatusBar: {} }));
jest.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { resolveStableInsets } from '~/hooks/useStableSafeAreaInsets';

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };
const PHONE = { top: 62, right: 0, bottom: 34, left: 0 };

describe('resolveStableInsets', () => {
  it('uses the launch insets before the live ones are measured', () => {
    expect(resolveStableInsets(ZERO, PHONE, 0)).toEqual(PHONE);
  });

  it('uses the live insets once measured, matching a phone exactly', () => {
    expect(resolveStableInsets(PHONE, PHONE, 0)).toEqual(PHONE);
  });

  it('follows the window when it changes after launch (iPhone Duo folded)', () => {
    const openPortrait = { top: 82, right: 0, bottom: 34, left: 0 };
    const closed = { top: 0, right: 84, bottom: 0, left: 0 };
    expect(resolveStableInsets(closed, openPortrait, 0)).toEqual(closed);
  });

  it('keeps zero insets when nothing was measured at launch either', () => {
    expect(resolveStableInsets(ZERO, null, 0)).toEqual(ZERO);
  });

  it('uses the Android status bar as a floor for the top', () => {
    expect(resolveStableInsets({ ...ZERO, bottom: 24 }, null, 32)).toEqual({
      ...ZERO,
      top: 32,
      bottom: 24,
    });
  });
});
