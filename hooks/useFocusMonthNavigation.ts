import { type MutableRefObject, type RefObject,useEffect } from 'react';
import type { FlatList } from 'react-native';

import { monthOffsetFromAnchorDate, parseMonthKey, startOfMonthDate } from '~/utils/formatters';

type ScrollToTopHandler = (() => void) | null;

interface UseFocusMonthNavigationParams {
  focusMonthToken: number;
  focusMonthKey: string | null;
  monthPagerAnchorDate: Date;
  centerIndex: number;
  clampIndex: (index: number) => number;
  setActiveIndex: (index: number) => void;
  listRef: RefObject<FlatList<number> | null>;
  getScrollToTopRef: (index: number) => MutableRefObject<ScrollToTopHandler>;
}

export function useFocusMonthNavigation({
  focusMonthToken,
  focusMonthKey,
  monthPagerAnchorDate,
  centerIndex,
  clampIndex,
  setActiveIndex,
  listRef,
  getScrollToTopRef,
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

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      getScrollToTopRef(targetIndex).current?.();
    });

    return () => cancelAnimationFrame(frame);
  }, [
    centerIndex,
    clampIndex,
    focusMonthKey,
    focusMonthToken,
    getScrollToTopRef,
    listRef,
    monthPagerAnchorDate,
    setActiveIndex,
  ]);
}
