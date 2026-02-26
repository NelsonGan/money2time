import { useRef, useMemo, useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { triggerHaptic } from '~/services/haptics';

export function useEdgeSwipeBack(onBack?: () => void) {
  const startXRef = useRef(0);

  const handleBack = useCallback(() => {
    void triggerHaptic('selection');
    onBack?.();
  }, [onBack]);

  return useMemo(() => {
    if (!onBack) {
      return Gesture.Pan().enabled(false);
    }

    return Gesture.Pan()
      .activeOffsetX([15, Infinity])
      .failOffsetY([-30, 30])
      .onBegin((e) => {
        'worklet';
        startXRef.current = e.absoluteX;
      })
      .onEnd((e, success) => {
        'worklet';
        if (success && startXRef.current <= 30 && e.translationX > 70) {
          runOnJS(handleBack)();
        }
      });
  }, [onBack, handleBack]);
}
