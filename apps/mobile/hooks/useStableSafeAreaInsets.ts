import { useMemo } from 'react';
import { Platform, StatusBar } from 'react-native';
import {
  type EdgeInsets,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * Safe-area insets that are right on the very first frame.
 *
 * A native-stack screen, or a modal opened on a cold launch, can render once
 * before its insets are measured, with every edge 0, so a header flashes
 * against the top and then snaps down. Until then this returns the insets
 * measured at app start; afterwards always the live ones, so they follow the
 * window when it changes (iPhone Duo folding or unfolding, for one). On
 * Android the status bar height is a floor for the top.
 */
export function resolveStableInsets(
  live: EdgeInsets,
  initial: EdgeInsets | null | undefined,
  androidStatusBar: number,
): EdgeInsets {
  const measured = live.top > 0 || live.bottom > 0 || live.left > 0 || live.right > 0;
  const base = measured || !initial ? live : initial;
  return androidStatusBar > base.top ? { ...base, top: androidStatusBar } : base;
}

export function useStableSafeAreaInsets(): EdgeInsets {
  const live = useSafeAreaInsets();
  const androidStatusBar = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  return useMemo(
    () => resolveStableInsets(live, initialWindowMetrics?.insets, androidStatusBar),
    [live, androidStatusBar],
  );
}
