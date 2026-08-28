import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useApp } from '~/context/AppContext';
import { isLiveActivityAvailable } from '~/services/liveActivity';

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

  // Read inside a listener that is registered once, so it must not close over
  // a stale symbol after the user changes their currency.
  const symbolRef = useRef(settings?.currencySymbol ?? '$');
  useEffect(() => {
    symbolRef.current = settings?.currencySymbol ?? '$';
  }, [settings?.currencySymbol]);

  useEffect(() => {
    if (!isLiveActivityAvailable) return;

    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      // Leaving the foreground is the money moment; coming back is when an
      // activity whose session expired while the app was away gets cleaned up.
      if (next === 'active' || previous === 'active') {
        void refreshLiveEarningsActivity(symbolRef.current);
      }
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
