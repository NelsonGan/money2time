import { useMemo } from 'react';
import { PanResponder } from 'react-native';

import { triggerHaptic } from '~/services/haptics';

export function useEdgeSwipeBack(onBack?: () => void) {
  return useMemo(() => {
    if (!onBack) return {};

    const responder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.x0 <= 24 && gestureState.dx > 10 && Math.abs(gestureState.dy) < 12,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 70 && Math.abs(gestureState.dy) < 40) {
          void triggerHaptic('selection');
          onBack();
        }
      },
    });

    return responder.panHandlers;
  }, [onBack]);
}
