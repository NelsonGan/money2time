import type { EventArg } from '@react-navigation/native';
import type { NativeStackNavigationEventMap } from '@react-navigation/native-stack';

import { triggerNavigationHaptic } from '~/services/haptics';

type NativeStackTransitionStartEvent = EventArg<
  'transitionStart',
  false,
  NativeStackNavigationEventMap['transitionStart']['data']
>;

type ScreenListenerContext = {
  route: {
    key: string;
    name: string;
  };
  navigation: {
    getState: () => {
      index: number;
      routes: { key: string }[];
    };
  };
};

function isTopRouteRouteKey(context: ScreenListenerContext) {
  const state = context.navigation.getState();
  const topRoute = state.routes[state.index];
  return topRoute?.key === context.route.key;
}

interface NativeStackSwipeHapticListenerOptions {
  skipRouteNames?: readonly string[];
  shouldSuppress?: () => boolean;
}

export function createNativeStackSwipeHapticListeners({
  skipRouteNames = [],
  shouldSuppress,
}: NativeStackSwipeHapticListenerOptions = {}) {
  const skipped = new Set(skipRouteNames);
  const suppress = shouldSuppress ?? (() => false);

  return (context: ScreenListenerContext) => ({
    transitionStart: (event: NativeStackTransitionStartEvent) => {
      if (!event.data.closing || suppress()) return;
      if (skipped.has(context.route.name)) return;
      if (!isTopRouteRouteKey(context)) return;
      void triggerNavigationHaptic();
    },
  });
}

export const SHARED_NATIVE_STACK_SWIPE_HAPTIC_LISTENERS = createNativeStackSwipeHapticListeners();
