import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Easing, type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { isLiquidGlassNavEnabled } from '~/components/navigation/liquidGlass';

// Scroll must travel this far in one direction before the bar reacts,
// filtering out bounce and micro-adjustments.
const DIRECTION_THRESHOLD = 12;
// Never minimize while near the top of the content.
const TOP_REVEAL_OFFSET = 48;
// Offset jumps larger than this are tab switches or programmatic scrolls,
// not user intent — ignore them.
const JUMP_IGNORE_DELTA = 160;
const MINIMIZE_DURATION_MS = 320;

interface BottomNavMinimizeContextValue {
  /** 0 = fully visible, 1 = minimized. Drives the glass bar's shrink animation. */
  minimizeProgress: SharedValue<number> | null;
  reportScrollOffset: (offsetY: number) => void;
  resetMinimize: () => void;
}

const BottomNavMinimizeContext = createContext<BottomNavMinimizeContextValue>({
  minimizeProgress: null,
  reportScrollOffset: () => {},
  resetMinimize: () => {},
});

export function BottomNavMinimizeProvider({ children }: { children: React.ReactNode }) {
  const minimizeProgress = useSharedValue(0);
  const lastOffsetRef = useRef(0);
  const minimizedRef = useRef(false);

  const setMinimized = useCallback(
    (minimized: boolean) => {
      if (minimizedRef.current === minimized) return;
      minimizedRef.current = minimized;
      minimizeProgress.value = withTiming(minimized ? 1 : 0, {
        duration: MINIMIZE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
    },
    [minimizeProgress],
  );

  const reportScrollOffset = useCallback(
    (offsetY: number) => {
      if (!isLiquidGlassNavEnabled()) return;
      const delta = offsetY - lastOffsetRef.current;
      lastOffsetRef.current = offsetY;
      if (Math.abs(delta) > JUMP_IGNORE_DELTA) return;
      if (offsetY <= TOP_REVEAL_OFFSET) {
        setMinimized(false);
        return;
      }
      if (delta > DIRECTION_THRESHOLD) {
        setMinimized(true);
      } else if (delta < -DIRECTION_THRESHOLD) {
        setMinimized(false);
      }
    },
    [setMinimized],
  );

  const resetMinimize = useCallback(() => {
    lastOffsetRef.current = 0;
    setMinimized(false);
  }, [setMinimized]);

  const value = useMemo(
    () => ({ minimizeProgress, reportScrollOffset, resetMinimize }),
    [minimizeProgress, reportScrollOffset, resetMinimize],
  );

  return (
    <BottomNavMinimizeContext.Provider value={value}>{children}</BottomNavMinimizeContext.Provider>
  );
}

export function useBottomNavMinimize(): BottomNavMinimizeContextValue {
  return useContext(BottomNavMinimizeContext);
}

/** onScroll handler for a tab's main scrollable; feeds the glass bar minimize state. */
export function useBottomNavScrollReporter() {
  const { reportScrollOffset } = useBottomNavMinimize();
  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      reportScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [reportScrollOffset],
  );
}
