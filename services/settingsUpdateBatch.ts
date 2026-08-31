/**
 * Batches `Settings Updated` into one event per settings visit.
 *
 * Every switch, picker and slider on a settings screen goes through
 * `updateSettings`, and tracking one event per call made this the app's loudest
 * event by a wide margin (~45K events / 30 days) while telling us nothing that a
 * per-visit summary doesn't: what a user changed in one sitting is one fact, not
 * eight. The changed keys are accumulated here instead and sent as a single
 * event when the user leaves the screen or backgrounds the app.
 *
 * `IDLE_FLUSH_MS` is the safety net for the third ending, a session that stops
 * without either (the app is killed while the settings screen is still up), so a
 * change is never silently dropped. It is long enough that a user working
 * through one screen still lands in one event.
 */

import { AnalyticsEvents, getCurrentScreen, trackEvent } from './analytics';

/** Idle window after the last change before the batch is sent on its own. */
export const IDLE_FLUSH_MS = 30_000;

let pendingKeys = new Set<string>();
let pendingUpdateCount = 0;
let pendingScreen: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer(): void {
  if (idleTimer === null) return;
  clearTimeout(idleTimer);
  idleTimer = null;
}

/**
 * Add one `updateSettings` call's changed keys to the pending batch.
 * Nothing is sent until something flushes it.
 */
export function recordSettingsUpdate(changedKeys: readonly string[]): void {
  let added = false;
  for (const key of changedKeys) {
    if (!key) continue;
    pendingKeys.add(key);
    added = true;
  }
  if (!added) return;

  // Captured here, not at flush time: the batch is usually sent *because* the
  // user navigated away, and `trackEvent` resolves the current screen after
  // awaiting SDK init — by then the app has already moved on, and the event
  // would claim the settings were changed on whatever screen came next.
  pendingScreen ??= getCurrentScreen();
  pendingUpdateCount += 1;
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    flushSettingsUpdates();
  }, IDLE_FLUSH_MS);
}

/**
 * Send the pending batch as one event. A no-op when nothing changed, so it is
 * safe to call on every screen change and every app-state transition.
 */
export function flushSettingsUpdates(): void {
  clearIdleTimer();
  if (pendingKeys.size === 0) return;

  // Sorted so the same set of toggles reads as the same `changed_fields` value
  // in Mixpanel however the user happened to order them.
  const changedFields = [...pendingKeys].sort().join(',');
  const changedCount = pendingKeys.size;
  const updateCount = pendingUpdateCount;
  const screen = pendingScreen;

  pendingKeys = new Set();
  pendingUpdateCount = 0;
  pendingScreen = null;

  void trackEvent(AnalyticsEvents.SETTINGS_UPDATED, {
    changed_fields: changedFields,
    changed_count: changedCount,
    // How many writes were collapsed into this event — the answer to "is the
    // batching working" without having to reason about the event volume.
    update_count: updateCount,
    // Omitted rather than sent as null when unknown, so `trackEvent` falls back
    // to its own resolution instead of being overridden with nothing.
    ...(screen ? { current_screen: screen } : {}),
  });
}

/** Drop the pending batch without sending it. Test seam for the module state. */
export function resetSettingsUpdateBatch(): void {
  clearIdleTimer();
  pendingKeys = new Set();
  pendingUpdateCount = 0;
  pendingScreen = null;
}
