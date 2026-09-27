import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform } from 'react-native';
import { Easing, type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingNavReservedInset } from '~/components/navigation/floatingNav';

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
  /** 0 = fully visible, 1 = minimized. Drives the floating bar's shrink animation. */
  minimizeProgress: SharedValue<number> | null;
  /** Pauses Android's live backdrop blur while content is moving. */
  isScrolling: SharedValue<boolean> | null;
  reportScrollOffset: (offsetY: number) => void;
  resetMinimize: () => void;
  /**
   * Bottom padding scroll content needs to clear the floating bar.
   * Zero outside the main tab shell, where root-stack screens have no bottom nav.
   */
  contentInset: number;
}

const BottomNavMinimizeContext = createContext<BottomNavMinimizeContextValue>({
  minimizeProgress: null,
  isScrolling: null,
  reportScrollOffset: () => {},
  resetMinimize: () => {},
  contentInset: 0,
});

export function BottomNavMinimizeProvider({ children }: { children: React.ReactNode }) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const contentInset = getFloatingNavReservedInset(safeBottom);
  const minimizeProgress = useSharedValue(0);
  const isScrolling = useSharedValue(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    },
    [],
  );
  const lastOffsetRef = useRef<number | null>(null);
  const directionalTravelRef = useRef(0);
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
      if (Platform.OS === 'android') {
        if (!isScrolling.value) isScrolling.value = true;
        if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = setTimeout(() => {
          isScrolling.value = false;
          scrollIdleTimerRef.current = null;
        }, 180);
      }
      const previousOffset = lastOffsetRef.current;
      lastOffsetRef.current = offsetY;
      if (offsetY <= TOP_REVEAL_OFFSET) {
        directionalTravelRef.current = 0;
        setMinimized(false);
        return;
      }
      // A tab can resume at its old scroll position after resetMinimize.
      // Establish that position before interpreting deltas as user travel.
      if (previousOffset === null) return;
      const delta = offsetY - previousOffset;
      if (Math.abs(delta) > JUMP_IGNORE_DELTA) {
        directionalTravelRef.current = 0;
        return;
      }
      if (delta === 0) return;
      if (Math.sign(delta) !== Math.sign(directionalTravelRef.current)) {
        directionalTravelRef.current = delta;
      } else {
        directionalTravelRef.current += delta;
      }
      if (directionalTravelRef.current > DIRECTION_THRESHOLD) {
        directionalTravelRef.current = 0;
        setMinimized(true);
      } else if (directionalTravelRef.current < -DIRECTION_THRESHOLD) {
        directionalTravelRef.current = 0;
        setMinimized(false);
      }
    },
    [isScrolling, setMinimized],
  );

  const resetMinimize = useCallback(() => {
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = null;
    isScrolling.value = false;
    lastOffsetRef.current = null;
    directionalTravelRef.current = 0;
    setMinimized(false);
  }, [isScrolling, setMinimized]);

  const value = useMemo(
    () => ({ minimizeProgress, isScrolling, reportScrollOffset, resetMinimize, contentInset }),
    [contentInset, isScrolling, minimizeProgress, reportScrollOffset, resetMinimize],
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
 * behind the floating bar. Zero outside the main tab shell.
 */
export function useBottomNavContentInset() {
  return useBottomNavMinimize().contentInset;
}

/** onScroll handler for a tab's main scrollable; feeds the bar minimize state. */
export function useBottomNavScrollReporter() {
  const { reportScrollOffset } = useBottomNavMinimize();
  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      // iOS can bounce beyond either end of a short list. Clamp that elastic
      // travel so settling at the bottom does not look like a reverse swipe.
      const maxOffset = Math.max(0, contentSize.height - layoutMeasurement.height);
      reportScrollOffset(Math.max(0, Math.min(contentOffset.y, maxOffset)));
    },
    [reportScrollOffset],
  );
}
