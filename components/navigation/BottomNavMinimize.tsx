import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Easing, type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getGlassNavReservedInset,
  isLiquidGlassNavEnabled,
} from '~/components/navigation/liquidGlass';

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
  /**
   * Bottom padding scroll content needs to clear the floating glass bar.
   * 0 in fallback mode and outside the main tab shell (root-stack screens
   * have no bottom nav), so the same screen component can render in both.
   */
  contentInset: number;
}

const BottomNavMinimizeContext = createContext<BottomNavMinimizeContextValue>({
  minimizeProgress: null,
  reportScrollOffset: () => {},
  resetMinimize: () => {},
  contentInset: 0,
});

export function BottomNavMinimizeProvider({ children }: { children: React.ReactNode }) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const contentInset = isLiquidGlassNavEnabled() ? getGlassNavReservedInset(safeBottom) : 0;
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
    () => ({ minimizeProgress, reportScrollOffset, resetMinimize, contentInset }),
    [contentInset, minimizeProgress, reportScrollOffset, resetMinimize],
  );

  return (
    <BottomNavMinimizeContext.Provider value={value}>{children}</BottomNavMinimizeContext.Provider>
  );
}

export function useBottomNavMinimize(): BottomNavMinimizeContextValue {
  return useContext(BottomNavMinimizeContext);
}

/**
 * Extra bottom padding a tab screen's scroll content needs so it isn't hidden
 * behind the floating glass bar. Zero in fallback mode, where the bar sits in
 * normal layout flow below the content, and zero outside the main tab shell.
 */
export function useBottomNavContentInset() {
  return useBottomNavMinimize().contentInset;
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
