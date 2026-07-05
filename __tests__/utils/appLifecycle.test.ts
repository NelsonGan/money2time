import type { AppStateStatus } from 'react-native';

import { shouldDismissKeyboardForAppState } from '~/utils/appLifecycle';

describe('shouldDismissKeyboardForAppState', () => {
  it('dismisses the keyboard on a genuine background trip', () => {
    expect(shouldDismissKeyboardForAppState('background')).toBe(true);
  });

  it('does not dismiss while the app is active', () => {
    expect(shouldDismissKeyboardForAppState('active')).toBe(false);
  });

  it('does not dismiss on transient inactive (Control Center / biometric sheet)', () => {
    expect(shouldDismissKeyboardForAppState('inactive')).toBe(false);
  });

  it('ignores other/unknown states without dismissing', () => {
    for (const state of ['extension', 'unknown'] as AppStateStatus[]) {
      expect(shouldDismissKeyboardForAppState(state)).toBe(false);
    }
  });
});
