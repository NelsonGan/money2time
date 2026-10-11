// Sentry MONEY2TIME-3Y / MONEY2TIME-62: pushing the app theme into AppCompat
// from an activity launched through an icon alias recreates it and crashes any
// open Modal. The theme gate asks `canApplyNativeColorScheme` first.

const mockPlatform = { OS: 'android' };
const mockGetAppIconName = jest.fn<string | null, []>();

jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('expo-alternate-app-icons', () => ({
  supportsAlternateIcons: true,
  getAppIconName: () => mockGetAppIconName(),
  setAlternateAppIcon: jest.fn(),
}));

import { canApplyNativeColorScheme } from '~/services/appIcon.native';

describe('canApplyNativeColorScheme', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockGetAppIconName.mockReset();
  });

  it('allows it on Android when launched through MainActivity itself', () => {
    mockGetAppIconName.mockReturnValue(null);
    expect(canApplyNativeColorScheme()).toBe(true);
  });

  it('refuses it on Android when launched through an alternate icon alias', () => {
    mockGetAppIconName.mockReturnValue('Detective');
    expect(canApplyNativeColorScheme()).toBe(false);
  });

  it('refuses it behind a retired alias too, which also leaves MainActivity disabled', () => {
    mockGetAppIconName.mockReturnValue('Retired');
    expect(canApplyNativeColorScheme()).toBe(false);
  });

  it('allows it when the native module cannot say', () => {
    mockGetAppIconName.mockImplementation(() => {
      throw new Error('no activity');
    });
    expect(canApplyNativeColorScheme()).toBe(true);
  });

  it('always allows it on iOS, where alternate icons do not touch the activity', () => {
    mockPlatform.OS = 'ios';
    mockGetAppIconName.mockReturnValue('Detective');
    expect(canApplyNativeColorScheme()).toBe(true);
  });
});
