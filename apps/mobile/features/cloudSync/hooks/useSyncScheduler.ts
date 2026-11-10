import { useEffect } from 'react';
import { AppState } from 'react-native';

/** How often `pushSoon` is asked: an edit reaches the cloud about this fast. */
const QUICK_EVERY_MS = 1_000;
const CHECK_EVERY_MS = 15_000;
/** The fallback pull, for when the live socket (services/liveSync.ts) is down. */
const PULL_EVERY_MS = 3 * 60_000;

interface SchedulerOptions {
  /**
   * Checked every second: true when this phone has edits that a sync would send
   * now (not when the last sync failed, which waits for the 15 s retry).
   */
  pushSoon?: () => boolean;
  /** How long `sync` waits while open with nothing wanted (the fallback pull: 3 minutes). */
  everyMs?: number;
  /** Also run on going to the background (the default), where a last push belongs. */
  onBackground?: boolean;
}

/**
 * While `active`: runs `sync` on return to the app and on going to the
 * background, within about a second of a local edit (`pushSoon`), every 15 s while
 * open if `needsSync()` says so (changes waiting, or the last sync failed),
 * and every 3 minutes (`everyMs`) otherwise. Changes from other phones arrive sooner
 * through the live socket; the 3-minute pull is the fallback.
 */
export function useSyncScheduler(
  active: boolean,
  sync: () => void,
  needsSync: () => boolean,
  { pushSoon, everyMs = PULL_EVERY_MS, onBackground = true }: SchedulerOptions = {},
) {
  useEffect(() => {
    if (!active) return;
    let lastRun = Date.now();
    let lastCheck = Date.now();
    const run = () => {
      lastRun = Date.now();
      sync();
    };
    const interval = setInterval(
      () => {
        if (AppState.currentState !== 'active') return;
        const now = Date.now();
        if (pushSoon?.()) {
          run();
          return;
        }
        // With the 1 s tick, the 15 s checks run on every fifteenth or so.
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
      clearInterval(interval);
      subscription.remove();
    };
  }, [active, sync, needsSync, pushSoon, everyMs, onBackground]);
}
