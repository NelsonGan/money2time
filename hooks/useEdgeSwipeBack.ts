import { useMemo, useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { triggerHaptic } from '~/services/haptics';

const EDGE_START_ZONE = 24;
const EDGE_ACTIVATION_X = 10;
const EDGE_MAX_VERTICAL_DRIFT = 12;
const EDGE_BACK_TRIGGER_X = 70;

export function useEdgeSwipeBack(onBack?: () => void) {
  const handleBack = useCallback(() => {
    void triggerHaptic('selection');
    onBack?.();
  }, [onBack]);

  return useMemo(() => {
    if (!onBack) {
      return Gesture.Pan().enabled(false);
    }

    return Gesture.Pan()
      .hitSlop({ left: 0, width: EDGE_START_ZONE })
      .activeOffsetX([EDGE_ACTIVATION_X, Infinity])
      .failOffsetY([-EDGE_MAX_VERTICAL_DRIFT, EDGE_MAX_VERTICAL_DRIFT])
      .onEnd((e, success) => {
        'worklet';
        if (success && e.translationX > EDGE_BACK_TRIGGER_X) {
          runOnJS(handleBack)();
        }
      });
  }, [onBack, handleBack]);
}
