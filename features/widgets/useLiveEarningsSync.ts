import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useApp } from '~/context/AppContext';
import { useThemeColor } from '~/context/ThemeContext';
import { isLiveActivityAvailable } from '~/services/liveActivity';

import { liveEarningsAccent } from './lib/liveEarningsAccent';
import { refreshLiveEarningsActivity } from './lib/refreshLiveEarnings';

/**
 * Keeps the live-earnings activity's money figure current, mounted once for
 * the app's lifetime.
 *
 * This deliberately does not live on the Live earnings screen. ActivityKit only
 * repaints on an update, and the update that matters is the one sent as the app
 * leaves the foreground - the instant before the user looks at their Lock
 * Screen. A listener owned by a screen dies the moment that screen is popped,
 * which is exactly what happens right after someone taps "Start the clock" and
 * navigates back, so the card would then sit frozen at the amount it started
 * with.
 */
export function useLiveEarningsSync() {
  const { settings } = useApp();
  const themeColor = useThemeColor();

  // Read inside a listener that is registered once, so it must not close over
  // a stale symbol - or a stale theme - after the user changes either.
  const symbolRef = useRef(settings?.currencySymbol ?? '$');
  useEffect(() => {
    symbolRef.current = settings?.currencySymbol ?? '$';
  }, [settings?.currencySymbol]);

  const accentRef = useRef(liveEarningsAccent(themeColor));
  useEffect(() => {
    accentRef.current = liveEarningsAccent(themeColor);
  }, [themeColor]);

  // The widget needs a feed to render, and the first foreground transition can
  // be a long way off. Writing one as soon as the app knows the currency (and
  // again if the currency or theme changes, since both are baked into the
  // precomputed labels) means the widget is never blank and never stale in the
  // wrong currency.
  const currencySymbol = settings?.currencySymbol;
  useEffect(() => {
    if (!isLiveActivityAvailable || !currencySymbol) return;
    void refreshLiveEarningsActivity(currencySymbol, liveEarningsAccent(themeColor));
  }, [currencySymbol, themeColor]);

  useEffect(() => {
    if (!isLiveActivityAvailable) return;

    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      // Leaving the foreground is the money moment; coming back is when an
      // activity whose session expired while the app was away gets cleaned up.
      if (next === 'active' || previous === 'active') {
        void refreshLiveEarningsActivity(symbolRef.current, accentRef.current);
      }
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
