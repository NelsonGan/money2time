import { useEffect, useRef, useState } from 'react';

/**
 * How long the root stack must stay on one screen before an app-level overlay
 * (a React Native `Modal`) may appear. Covers the native dismiss of a modal
 * route: navigation state drops the route at the start of that dismiss, and
 * native-stack sends no `transitionEnd` for a route that has already left the
 * state, so there is no event to wait for instead.
 */
export const ROOT_SCREEN_SETTLE_MS = 800;

/**
 * True once `screen` has been the root stack's top screen for
 * `ROOT_SCREEN_SETTLE_MS`, false from the render where it changes.
 *
 * Presenting a `Modal` while a native modal route is still being dismissed
 * leaves iOS with an invisible modal that takes every touch: the page looks
 * normal but nothing responds until the app is killed. That is what happened
 * when an entry was saved from the home-screen widget with a feature
 * announcement waiting behind the quick-add sheet.
 */
export function useRootScreenSettled(screen: string): boolean {
  const [settledScreen, setSettledScreen] = useState<string | null>(screen);
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    if (isFirstRunRef.current) {
      // The first screen needs no wait: nothing was dismissed before it.
      isFirstRunRef.current = false;
      return undefined;
    }
    // Each change restarts the wait, so leaving and coming back quickly still
    // waits out the second dismiss.
    setSettledScreen(null);
    const timeout = setTimeout(() => setSettledScreen(screen), ROOT_SCREEN_SETTLE_MS);
    return () => clearTimeout(timeout);
  }, [screen]);

  return settledScreen === screen;
}
