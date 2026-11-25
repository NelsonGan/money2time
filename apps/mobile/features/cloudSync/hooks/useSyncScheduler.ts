import { useEffect } from 'react';
import { AppState } from 'react-native';

import { subscribeLocalDataChanged } from '../lib/outboxWake';

/** Debounce after a local write notification: fast push while coalescing multi-row bursts. */
const WAKE_DEBOUNCE_MS = 250;
/** Fallback outbox poll for writes outside `AppContext` / `albumGroupWrites`. */
const QUICK_EVERY_MS = 3_000;
const CHECK_EVERY_MS = 15_000;
/** The fallback pull, for when the live socket (services/liveSync.ts) is down. */
const PULL_EVERY_MS = 3 * 60_000;

interface SchedulerOptions {
  /**
   * Checked on local write wakes (debounced 250 ms) and on the fallback poll:
   * true when this phone has edits that a sync would send now (not when the
   * last sync failed, which waits for the 15 s retry).
   */
  pushSoon?: () => boolean;
  /**
   * Optional targeted runner for `pushSoon` triggers (pushes only the
   * channel(s) that have pending outbox edits, avoiding unnecessary cross-
   * channel pulls). Returns `true` when it started a sync; if it returns
   * `false`, the interval falls through to normal 15 s / 3 min checks so a
   * paused-ledger outbox entry can never starve periodic pulls.
   */
  onPushSoon?: () => boolean;
  /** How long `sync` waits while open with nothing wanted (the fallback pull: 3 minutes). */
  everyMs?: number;
  /** Also run on going to the background (the default), where a last push belongs. */
  onBackground?: boolean;
}

/**
 * While `active`: runs `sync` on return to the app and on going to the
 * background, within ~250 ms of a local edit (`pushSoon` + `notifyLocalDataChanged`),
 * every 15 s while open if `needsSync()` says so (changes waiting, or the last
 * sync failed), and every 3 minutes (`everyMs`) otherwise. Changes from other
 * phones arrive sooner through the live socket; the 3-minute pull is the fallback.
 */
export function useSyncScheduler(
  active: boolean,
  sync: () => void,
  needsSync: () => boolean,
  { pushSoon, onPushSoon, everyMs = PULL_EVERY_MS, onBackground = true }: SchedulerOptions = {},
) {
  useEffect(() => {
    if (!active) return;
    let lastRun = Date.now();
    let lastCheck = Date.now();
    let wakeTimer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      lastRun = Date.now();
      sync();
    };
    const runPush = (): boolean => {
      if (onPushSoon) return onPushSoon();
      run();
      return true;
    };
    const unsubscribeWake = pushSoon
      ? subscribeLocalDataChanged(() => {
          if (AppState.currentState !== 'active') return;
          if (wakeTimer) clearTimeout(wakeTimer);
          wakeTimer = setTimeout(() => {
            wakeTimer = null;
            if (AppState.currentState !== 'active') return;
            if (pushSoon()) runPush();
          }, WAKE_DEBOUNCE_MS);
        })
      : null;
    const interval = setInterval(
      () => {
        if (AppState.currentState !== 'active') return;
        const now = Date.now();
        if (pushSoon?.() && runPush()) {
          return;
        }
        if (pushSoon && now - lastCheck < CHECK_EVERY_MS - QUICK_EVERY_MS / 2) return;
        lastCheck = now;
        if (now - lastRun > everyMs || needsSync()) run();
      },
      pushSoon ? QUICK_EVERY_MS : CHECK_EVERY_MS,
    );
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' || (onBackground && next === 'background')) run();
    });
    return () => {
      if (wakeTimer) clearTimeout(wakeTimer);
      unsubscribeWake?.();
      clearInterval(interval);
      subscription.remove();
    };
  }, [active, sync, needsSync, pushSoon, onPushSoon, everyMs, onBackground]);
}
