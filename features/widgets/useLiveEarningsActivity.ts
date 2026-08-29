import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getThemePalette } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColor } from '~/context/ThemeContext';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import {
  endLiveActivity,
  getCurrentLiveActivity,
  getLiveActivityStatus,
  isLiveActivityAvailable,
  startLiveActivity,
} from '~/services/liveActivity';
import { formatCurrency, formatTimeOfDay } from '~/utils/formatters';

import {
  clampSessionHours,
  clampStartedMinutesAgo,
  earnedByNow,
  isSessionOver,
  type LiveEarningsSession,
  MS_PER_MINUTE,
  sessionEndFor,
} from './lib/liveEarnings';

/**
 * '#RRGGBB' to the 0xRRGGBB integer the extension expects. The widget target
 * cannot import the design system, so the colour travels as a number.
 */
function hexToInt(color: string): number {
  const parsed = Number.parseInt(color.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : 0x1f8a6f;
}

export interface LiveEarningsActivityController {
  /** The build and OS can run Live Activities at all. */
  available: boolean;
  /**
   * ActivityKit has been asked what is running at least once. Until it has,
   * the screen cannot tell "nothing running" from "not looked yet", and
   * rendering the start button on a session that is already live reads as the
   * feature having forgotten itself.
   */
  hydrated: boolean;
  /** The user has not switched Live Activities off for Money2Time. */
  enabled: boolean;
  /** The session currently on the Lock Screen, or null. */
  session: LiveEarningsSession | null;
  /** A start/stop call is in flight. */
  busy: boolean;
  /**
   * `startedMinutesAgo` backdates the session, for someone who starts the
   * clock after they actually started working. It is snapped and bounded by
   * the session length.
   */
  start: (hours: number, startedMinutesAgo?: number) => Promise<boolean>;
  stop: () => Promise<void>;
}

export function useLiveEarningsActivity(hourlyRate: number): LiveEarningsActivityController {
  const { settings } = useApp();
  const currencySymbol = settings?.currencySymbol ?? '$';

  // Both variants, because the card is drawn by the OS in whichever appearance
  // the viewer is in and the extension has no way to ask the app which theme
  // is active.
  const themeColor = useThemeColor();
  const accent = useMemo(
    () => ({
      accentLightHex: hexToInt(getThemePalette(themeColor, 'light').primary),
      accentDarkHex: hexToInt(getThemePalette(themeColor, 'dark').primary),
    }),
    [themeColor],
  );

  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(!isLiveActivityAvailable);
  const [session, setSession] = useState<LiveEarningsSession | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * ActivityKit outlives the JS runtime, so what is on the Lock Screen is
   * whatever it says is there, not what this hook last remembered.
   */
  const syncFromSystem = useCallback(async () => {
    if (!isLiveActivityAvailable) return;
    try {
      const [status, current] = await Promise.all([
        getLiveActivityStatus(),
        getCurrentLiveActivity(),
      ]);
      setEnabled(status.enabled);

      if (!current) {
        setSession(null);
        return;
      }
      const restored: LiveEarningsSession = {
        startedAt: current.startedAt,
        endsAt: current.endsAt,
        hourlyRate: current.hourlyRate,
      };
      // A session that ran out while the app was closed is stale, not running.
      if (isSessionOver(restored, Date.now())) {
        await endLiveActivity();
        setSession(null);
        return;
      }
      setSession(restored);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void syncFromSystem();
  }, [syncFromSystem]);

  // Re-read on return to the foreground so a session that expired, or that the
  // user swiped off the Lock Screen, is reflected here. Pushing updates is
  // `useLiveEarningsSync`'s job, not this screen's.
  useEffect(() => {
    if (!isLiveActivityAvailable) return;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void syncFromSystem();
    });
    return () => subscription.remove();
  }, [syncFromSystem]);

  const start = useCallback(
    async (hours: number, startedMinutesAgo = 0) => {
      if (!isLiveActivityAvailable || hourlyRate <= 0) return false;
      setBusy(true);
      try {
        // Clamp up front so the session, the copy and the analytics all agree
        // on how long this actually runs for.
        const requestedHours = clampSessionHours(hours);
        const offsetMinutes = clampStartedMinutesAgo(startedMinutesAgo, requestedHours);
        // Backdating moves the whole session, not just the opening figure: the
        // card's elapsed clock and progress bar are drawn by the system from
        // these two dates, so they pick the offset up for free.
        const startedAt = Date.now() - offsetMinutes * MS_PER_MINUTE;
        const endsAt = sessionEndFor(startedAt, requestedHours);
        const endDate = new Date(endsAt);
        // A backdated session has already earned something. Opening at 0 would
        // show the wrong number until the first update pushed a correction.
        const earnedSoFar = earnedByNow({ startedAt, endsAt, hourlyRate }, Date.now());

        await startLiveActivity({
          startedAt,
          endsAt,
          hourlyRate,
          earnedText: formatCurrency(earnedSoFar, currencySymbol),
          earned: earnedSoFar,
          ...accent,
          titleText: I18n.t('widgets.live.headline'),
          rateText: I18n.t('widgets.live.rate', {
            amount: formatCurrency(hourlyRate, currencySymbol),
          }),
          endsText: I18n.t('widgets.live.ends_at', {
            time: formatTimeOfDay(endDate.getHours(), endDate.getMinutes()),
          }),
        });

        setSession({ startedAt, endsAt, hourlyRate });
        setEnabled(true);
        void trackEvent(AnalyticsEvents.LIVE_EARNINGS_STARTED, {
          hours: requestedHours,
          startedMinutesAgo: offsetMinutes,
        });
        return true;
      } catch {
        // The most likely cause is the user having turned Live Activities off
        // since this screen last looked, so re-read rather than just failing.
        await syncFromSystem();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accent, currencySymbol, hourlyRate, syncFromSystem],
  );

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      await endLiveActivity();
      setSession(null);
      void trackEvent(AnalyticsEvents.LIVE_EARNINGS_STOPPED);
    } finally {
      setBusy(false);
    }
  }, []);

  return useMemo(
    () => ({ available: isLiveActivityAvailable, hydrated, enabled, session, busy, start, stop }),
    [busy, enabled, hydrated, session, start, stop],
  );
}
