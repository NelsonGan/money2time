import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
 * That guard only covers setPage calls we make ourselves. The same
 * "two transitions in flight at once" crash still recurred afterwards
 * (MONEY2TIME-S/1A/2F) from a second cause: the user swiping again before
 * UIPageViewController finishes settling the first swipe corrupts its
 * internal transition queue exactly the same way. `scrollEnabled` disables
 * the pager's pan gesture recognizer for the duration of the settle
 * animation (not while the user's own finger is still dragging, which would
 * otherwise cut their swipe off mid-gesture) so a second swipe can't land in
 * that window; it re-enables the instant the pager reports `idle`.
 *
 * Callers still own the page index driving `activeIndex` and their own
 * `onPageSelected` swipe handler; wire this hook's `positionRef` into that
 * handler (`positionRef.current = position`) and its `scrollEnabled` /
 * `onPageScrollStateChanged` onto the `<PagerView>`.
 *
 * `transitioningRef` is exposed for a related but distinct hazard: unmounting
 * the `<PagerView>` itself (not just calling `setPage`) while it is dragging
 * or settling tears down its native view mid-transition. On Android this can
 * leave ViewPager2's RecyclerView flinging against a torn-down internal state
 * and crash with "Scrapped or attached views may not be recycled" (Sentry
 * MONEY2TIME-1Y). A caller that conditionally swaps the `<PagerView>` out for
 * other content in response to a tap on a page's own children (e.g. a tile
 * that takes over the sheet) should check `transitioningRef.current` first
 * and ignore the tap until the pager is idle.
 *
 * That still only covers dismissals this app code initiates. MONEY2TIME-1Y
 * kept recurring afterwards from a third cause outside any of our own
 * handlers: the OS itself pausing the host activity mid-fling when an
 * external activity takes over the foreground (observed with the Google
 * Sign-In consent screen launched from auto-backup's silent re-auth), which
 * corrupts ViewPager2's recycler exactly like an unmount does. There is no
 * app-code hook to intercept that specific transition, so this hook instead
 * watches `AppState`: the moment the app leaves `active` while a page is
 * still dragging or settling, it snaps the pager to its current page with
 * `setPageWithoutAnimation`, which cancels the in-flight fling before the
 * surface goes away instead of leaving it running into one.
 */
export function usePagerTabSync(pagerRef: React.RefObject<PagerView | null>, activeIndex: number) {
  const positionRef = useRef(activeIndex);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const transitioningRef = useRef(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

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
      const { pageScrollState } = event.nativeEvent;
      transitioningRef.current = pageScrollState !== 'idle';
      setScrollEnabled(pageScrollState !== 'settling');
      if (!transitioningRef.current) syncPage();
    },
    [syncPage],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' || !transitioningRef.current) return;
      // The activity is being paused mid-transition (e.g. an external sign-in
      // screen taking the foreground). Snap to the current page without an
      // animation so the recycler settles instead of flinging into a torn-
      // down surface (Sentry MONEY2TIME-1Y).
      transitioningRef.current = false;
      setScrollEnabled(true);
      pagerRef.current?.setPageWithoutAnimation(positionRef.current);
    });
    return () => subscription.remove();
  }, [pagerRef]);

  return { positionRef, scrollEnabled, transitioningRef, onPageScrollStateChanged };
}
