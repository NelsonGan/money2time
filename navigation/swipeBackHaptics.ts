import { triggerHaptic } from '~/services/haptics';
import type { EventArg } from '@react-navigation/native';
import type { NativeStackNavigationEventMap } from '@react-navigation/native-stack';

type NativeStackTransitionStartEvent = EventArg<
  'transitionStart',
  false,
  NativeStackNavigationEventMap['transitionStart']['data']
>;

export const SHARED_NATIVE_STACK_SWIPE_HAPTIC_LISTENERS = {
  transitionStart: (event: NativeStackTransitionStartEvent) => {
    if (!event.data.closing) return;
    void triggerHaptic('selection');
  },
};

interface NativeStackSwipeHapticListenerOptions {
  skipRouteNames?: ReadonlyArray<string>;
  shouldSuppress?: () => boolean;
}

export function createNativeStackSwipeHapticListeners({
  skipRouteNames = [],
  shouldSuppress,
}: NativeStackSwipeHapticListenerOptions = {}) {
  const skipped = new Set(skipRouteNames);
  const suppress = shouldSuppress ?? (() => false);

  return ({ route }: { route: { name: string } }) => ({
    transitionStart: (event: NativeStackTransitionStartEvent) => {
      if (!event.data.closing || skipped.has(route.name) || suppress()) return;
      void triggerHaptic('selection');
    },
  });
}
