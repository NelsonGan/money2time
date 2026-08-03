import { useCallback, useEffect, useRef } from 'react';
import type PagerView from 'react-native-pager-view';
import type { PageScrollStateChangedNativeEvent } from 'react-native-pager-view';

/**
 * Keeps a `PagerView`'s native page aligned with an externally-driven index
 * (a tab tap, a header pill) without ever issuing `setPage` while a previous
 * transition is still in flight. Calling `setPage` mid-transition is what
 * crashes `RNCPagerViewComponentView` on iOS when a second tab tap lands
 * before the pager finishes settling the first (Sentry MONEY2TIME-S:
 * "No view controller managing visible view"; MONEY2TIME-1A: "Duplicate
 * states in queue"). A `setPage` requested while transitioning is coalesced:
 * only the latest desired index is applied, once the pager reports `idle`.
 *
 * Callers still own the page index driving `activeIndex` and their own
 * `onPageSelected` swipe handler; wire this hook's `positionRef` into that
 * handler (`positionRef.current = position`) and its
 * `onPageScrollStateChanged` onto the `<PagerView>`.
 */
export function usePagerTabSync(pagerRef: React.RefObject<PagerView | null>, activeIndex: number) {
  const positionRef = useRef(activeIndex);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const transitioningRef = useRef(false);

  const syncPage = useCallback(() => {
    const target = activeIndexRef.current;
    if (target === positionRef.current || transitioningRef.current) return;
    positionRef.current = target;
    pagerRef.current?.setPage(target);
  }, [pagerRef]);

  useEffect(() => {
    syncPage();
  }, [activeIndex, syncPage]);

  const onPageScrollStateChanged = useCallback(
    (event: PageScrollStateChangedNativeEvent) => {
      transitioningRef.current = event.nativeEvent.pageScrollState !== 'idle';
      if (!transitioningRef.current) syncPage();
    },
    [syncPage],
  );

  return { positionRef, onPageScrollStateChanged };
}
