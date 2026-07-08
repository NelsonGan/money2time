import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

export const SHARED_NATIVE_STACK_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  gestureEnabled: true,
  fullScreenGestureEnabled: false,
  // Keep this false. It maps to react-native-screens' `customAnimationOnSwipe`,
  // which swaps iOS's native interactive pop for a custom JS-driven animator so
  // the swipe-dismiss matches `slide_from_right`. That custom animator races its
  // own teardown on rapid consecutive swipe-backs: when you swipe back twice
  // quickly, the previous screen flashes back in before settling on the final
  // screen. Letting the edge swipe use the native pop transition removes the
  // flash while staying visually consistent (both are horizontal slides).
  animationMatchesGesture: false,
};

export const DISABLE_BACK_GESTURE_STACK_OPTIONS: NativeStackNavigationOptions = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};
