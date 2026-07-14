import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

export const SHARED_NATIVE_STACK_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  // On iOS `slide_from_right` already resolves to the platform's native slide
  // (react-native-screens maps it to the default UIKit push there); on Android
  // it's the real right-to-left slide. Same value, correct look on both.
  animation: 'slide_from_right',
  gestureEnabled: true,
  fullScreenGestureEnabled: false,
  // `false` is already react-native-screens' default, so this is explicit, not a
  // behavior change: the interactive swipe-back uses the native pop rather than
  // re-running the `animation` above. NOTE: this does NOT cure the flash of the
  // previous screen on a rapid double swipe-back — that's an upstream
  // react-native-screens interactive-pop bug (see issues #2559 / #2454), not
  // something these options fix. A real fix needs a screens upgrade (out of Expo
  // SDK 54's pinned ~4.16.0 range) verified on a device build.
  animationMatchesGesture: false,
};

export const DISABLE_BACK_GESTURE_STACK_OPTIONS: NativeStackNavigationOptions = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};
