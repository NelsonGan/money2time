/**
 * What the Live earnings screen offers, decided from what ActivityKit and the
 * user's settings say. Pure so the rules can be tested without rendering.
 */

export interface LiveEarningsScreenInputs {
  /** The build and OS can run Live Activities at all. */
  available: boolean;
  /** ActivityKit has been asked what is running at least once. */
  hydrated: boolean;
  /** Live Activities are not switched off for the app in iOS Settings. */
  enabled: boolean;
  /** The user has an hourly value for today. */
  hasWage: boolean;
  /** A session is on the Lock Screen now. */
  running: boolean;
}

/** Why a new session cannot be started, shown as a card under the preview. */
export type LiveEarningsBlocker = 'unavailable' | 'wage' | 'disabled';

export interface LiveEarningsScreenState {
  /** A new session can be started from here. */
  canStart: boolean;
  /** The Start / Stop button is shown. */
  showActionBar: boolean;
  /** The card explaining why nothing can be started, or null. */
  blocker: LiveEarningsBlocker | null;
  /** The shift schedule section is shown. */
  showSchedule: boolean;
}

export function liveEarningsScreenState({
  available,
  hydrated,
  enabled,
  hasWage,
  running,
}: LiveEarningsScreenInputs): LiveEarningsScreenState {
  const canStart = available && hasWage && enabled;
  // A running session can always be stopped, whatever stops a new one from
  // starting. A session started before the hourly value was deleted keeps
  // running, and hiding Stop with the Start button left it on the Lock Screen
  // with no way to end it from the app.
  const showActionBar = hydrated && (running || canStart);

  let blocker: LiveEarningsBlocker | null = null;
  // While a session runs, the card on screen is that session and Stop is
  // right below it, so "set your hourly value and the clock is ready" would
  // contradict both. The reason comes back once the session is stopped.
  if (!running) {
    if (!available) blocker = 'unavailable';
    else if (!hasWage) blocker = 'wage';
    // Not known until hydrated: showing the switched-off card while ActivityKit
    // is still being asked would flash a wrong explanation on every open.
    else if (hydrated && !enabled) blocker = 'disabled';
  }

  return { canStart, showActionBar, blocker, showSchedule: canStart && hydrated };
}
