/**
 * Bridge for "open the live-earnings screen and start the clock".
 *
 * The auto-start reminder cannot start the Live Activity itself — iOS refuses
 * `Activity.request()` outside the foreground — so the notification's deep
 * link routes here instead: the app opens on the live-earnings screen, and the
 * screen consumes the pending request and starts the session.
 *
 * The request is *pending state*, not just an event, because the deep link is
 * handled while the screen is still being pushed. An event fired at that moment
 * would land before anything is listening; a flag survives until the screen
 * mounts and claims it.
 */

interface PendingStart {
  hours: number;
}

let pending: PendingStart | null = null;

export function requestStartLiveEarnings(hours: number) {
  pending = { hours };
}

/**
 * Reads and clears the pending request, so a start fires exactly once. Coming
 * back to the screen later must not silently start another session.
 */
export function consumePendingLiveEarningsStart(): PendingStart | null {
  const request = pending;
  pending = null;
  return request;
}

export function clearPendingLiveEarningsStart() {
  pending = null;
}
