import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

export const SHARED_NATIVE_STACK_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  gestureEnabled: true,
  fullScreenGestureEnabled: false,
  animationMatchesGesture: true,
};

export const DISABLE_BACK_GESTURE_STACK_OPTIONS: NativeStackNavigationOptions = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};
