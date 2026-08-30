import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useThemeColor } from '~/context/ThemeContext';
import { reportError } from '~/services/errorReporting';
import { isLiveActivityAvailable } from '~/services/liveActivity';

import { liveEarningsAccent } from './lib/liveEarningsAccent';
import { refreshLiveEarningsActivity } from './lib/refreshLiveEarnings';
import { syncLiveEarningsAutoStart } from './lib/syncLiveEarningsAutoStart';

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
  const { settings, notificationPrefs, getTrueHourlyRateForDate } = useApp();
  const { isPro } = usePro();
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

  // The push Worker keys its rows by account, so the listener needs the current
  // id for the same reason it needs the current symbol.
  const appUserIdRef = useRef(settings?.appUserId ?? '');
  useEffect(() => {
    appUserIdRef.current = settings?.appUserId ?? '';
  }, [settings?.appUserId]);

  const scheduleRef = useRef(notificationPrefs.liveEarningsStart);
  useEffect(() => {
    scheduleRef.current = notificationPrefs.liveEarningsStart;
  }, [notificationPrefs.liveEarningsStart]);

  const rateRef = useRef(0);
  // Auto-start is Pro-only, and a subscription can lapse while a schedule is
  // armed - so this is read on every pass, not once at the toggle.
  const isProRef = useRef(isPro);
  useEffect(() => {
    isProRef.current = isPro;
  }, [isPro]);

  // The widget needs a feed to render, and the first foreground transition can
  // be a long way off. Writing one as soon as the app knows the currency (and
  // again if the currency or theme changes, since both are baked into the
  // precomputed labels) means the widget is never blank and never stale in the
  // wrong currency.
  const currencySymbol = settings?.currencySymbol;
  const appUserId = settings?.appUserId;
  useEffect(() => {
    if (!isLiveActivityAvailable || !currencySymbol) return;
    void refreshLiveEarningsActivity({
      currencySymbol,
      accent: liveEarningsAccent(themeColor),
      appUserId: appUserId ?? '',
    });
  }, [appUserId, currencySymbol, themeColor]);

  // The shift schedule, armed wherever it can start the card by itself and
  // fallen back to a reminder where it cannot. Re-run on every change to the
  // schedule and to everything baked into the registration, since the Worker
  // pushes back the copy registered here rather than rendering any of its own.
  //
  // Keyed on the schedule's *values*, not the object: a reload hands back an
  // equal-but-new prefs object, and re-registering on every settings write
  // would be a request each time for a schedule that has not moved.
  const schedule = notificationPrefs.liveEarningsStart;
  const scheduleKey = `${schedule.enabled}|${schedule.days.join(',')}|${schedule.hour}|${schedule.minute}|${schedule.shiftHours}`;
  const scheduleHourlyRate = useMemo(
    () => getTrueHourlyRateForDate(new Date().toISOString()),
    [getTrueHourlyRateForDate],
  );
  useEffect(() => {
    rateRef.current = scheduleHourlyRate;
    if (!currencySymbol) return;
    syncLiveEarningsAutoStart({
      // The ref, so the effect can key on the values above without the linter
      // demanding the object it would then re-run on. It is written by the
      // effect declared before this one, so it is never behind.
      schedule: scheduleRef.current,
      isPro,
      hourlyRate: scheduleHourlyRate,
      currencySymbol,
      accent: liveEarningsAccent(themeColor),
      appUserId: appUserId ?? '',
    }).catch((error) => {
      // scheduleLiveEarningsStart's Notifications.scheduleNotificationAsync
      // call can reject with a transient OS error (e.g. iOS's notification
      // daemon connection dropping), which otherwise surfaced as an
      // unhandled rejection on every foreground (Sentry MONEY2TIME-R).
      reportError(error, { scope: 'notifications' });
    });
  }, [appUserId, currencySymbol, isPro, scheduleKey, scheduleHourlyRate, themeColor]);

  useEffect(() => {
    if (!isLiveActivityAvailable) return;

    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      // Leaving the foreground is the money moment; coming back is when an
      // activity whose session expired while the app was away gets cleaned up.
      if (next === 'active' || previous === 'active') {
        void refreshLiveEarningsActivity({
          currencySymbol: symbolRef.current,
          accent: accentRef.current,
          appUserId: appUserIdRef.current,
        });
      }
      // Coming back is also when the schedule is re-armed: it is what repairs a
      // registration that failed while offline, picks up a push-to-start token
      // iOS has rotated, and follows the user into a new time zone.
      if (next === 'active') {
        syncLiveEarningsAutoStart({
          schedule: scheduleRef.current,
          isPro: isProRef.current,
          hourlyRate: rateRef.current,
          currencySymbol: symbolRef.current,
          accent: accentRef.current,
          appUserId: appUserIdRef.current,
        }).catch((error) => {
          reportError(error, { scope: 'notifications' });
        });
      }
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
