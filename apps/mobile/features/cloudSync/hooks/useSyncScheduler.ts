import { useEffect } from 'react';
import { AppState } from 'react-native';

const CHECK_EVERY_MS = 15_000;
const PULL_EVERY_MS = 3 * 60_000;

/**
 * While `active`: runs `sync` on return to the app and on going to the
 * background, every 15 s while open if `needsSync()` says so (changes waiting,
 * or the last sync failed), and every 3 minutes otherwise.
 */
export function useSyncScheduler(active: boolean, sync: () => void, needsSync: () => boolean) {
  useEffect(() => {
    if (!active) return;
    let lastRun = Date.now();
    const run = () => {
      lastRun = Date.now();
      sync();
    };
    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (Date.now() - lastRun > PULL_EVERY_MS || needsSync()) run();
    }, CHECK_EVERY_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' || next === 'background') run();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [active, sync, needsSync]);
}
