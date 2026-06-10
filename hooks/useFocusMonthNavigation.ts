import { type MutableRefObject, type RefObject, useEffect } from 'react';
import type { FlatList } from 'react-native';

import { monthOffsetFromAnchorDate, parseMonthKey, startOfMonthDate } from '~/utils/formatters';

type ScrollToTopHandler = (() => void) | null;
type ScrollToDayHandler = ((dayKey: string) => void) | null;

interface UseFocusMonthNavigationParams {
  focusMonthToken: number;
  focusMonthKey: string | null;
  /** Day (YYYY-MM-DD) to scroll to within the focused month, if any. */
  focusDayKey?: string | null;
  monthPagerAnchorDate: Date;
  centerIndex: number;
  clampIndex: (index: number) => number;
  setActiveIndex: (index: number) => void;
  listRef: RefObject<FlatList<number> | null>;
  getScrollToTopRef: (index: number) => MutableRefObject<ScrollToTopHandler>;
  getScrollToDayRef?: (index: number) => MutableRefObject<ScrollToDayHandler>;
}

export function useFocusMonthNavigation({
  focusMonthToken,
  focusMonthKey,
  focusDayKey = null,
  monthPagerAnchorDate,
  centerIndex,
  clampIndex,
  setActiveIndex,
  listRef,
  getScrollToTopRef,
  getScrollToDayRef,
}: UseFocusMonthNavigationParams): void {
  useEffect(() => {
    if (focusMonthToken <= 0) return;

    const target = focusMonthKey ? parseMonthKey(focusMonthKey) : startOfMonthDate(new Date());
    if (!target) return;

    const targetDate = startOfMonthDate(target);
    const targetIndex = clampIndex(
      centerIndex + monthOffsetFromAnchorDate(monthPagerAnchorDate, targetDate),
    );
    setActiveIndex(targetIndex);

    const dayTimers: ReturnType<typeof setTimeout>[] = [];
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      if (focusDayKey && getScrollToDayRef) {
        // Give the destination page's list a moment to mount/lay out before
        // scrolling to the target day's section header. Retry once in case the
        // page (a far-away month) hasn't registered its handler at the first
        // attempt; the handler is a no-op once we've already landed on the day.
        dayTimers.push(
          setTimeout(() => {
            const handler = getScrollToDayRef(targetIndex).current;
            if (handler) {
              handler(focusDayKey);
              return;
            }
            dayTimers.push(
              setTimeout(() => getScrollToDayRef(targetIndex).current?.(focusDayKey), 220),
            );
          }, 80),
        );
        return;
      }
      getScrollToTopRef(targetIndex).current?.();
    });

    return () => {
      cancelAnimationFrame(frame);
      dayTimers.forEach(clearTimeout);
    };
  }, [
    centerIndex,
    clampIndex,
    focusDayKey,
    focusMonthKey,
    focusMonthToken,
    getScrollToDayRef,
    getScrollToTopRef,
    listRef,
    monthPagerAnchorDate,
    setActiveIndex,
  ]);
}
