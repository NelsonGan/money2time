import { type MutableRefObject, type RefObject, useEffect } from 'react';
import type { FlatList } from 'react-native';

type ScrollToTopHandler = (() => void) | null;

interface UseScrollToTopTokenNavigationParams {
  scrollToTopToken: number;
  activeIndexRef: MutableRefObject<number>;
  listRef: RefObject<FlatList<number> | null>;
  getScrollToTopRef: (index: number) => MutableRefObject<ScrollToTopHandler>;
  onBeforePageScroll?: () => boolean;
}

export function useScrollToTopTokenNavigation({
  scrollToTopToken,
  activeIndexRef,
  listRef,
  getScrollToTopRef,
  onBeforePageScroll,
}: UseScrollToTopTokenNavigationParams): void {
  useEffect(() => {
    if (scrollToTopToken <= 0) return;

    const frame = requestAnimationFrame(() => {
      if (onBeforePageScroll?.()) return;

      const currentIndex = activeIndexRef.current;
      listRef.current?.scrollToIndex({ index: currentIndex, animated: false });
      getScrollToTopRef(currentIndex).current?.();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeIndexRef, getScrollToTopRef, listRef, onBeforePageScroll, scrollToTopToken]);
}
