/**
 * Whether the native splash has been lifted onto the first real screen, for
 * work that should wait until the user can see the app. Doing it earlier
 * competes with the first screen for the JS thread and holds the splash up.
 */

let splashHidden = false;
const listeners = new Set<() => void>();

export function markSplashHidden() {
  if (splashHidden) return;
  splashHidden = true;
  const pending = [...listeners];
  listeners.clear();
  pending.forEach((listener) => listener());
}

/**
 * Run `callback` once the splash has been hidden, straight away if it already
 * has. Returns a function that cancels a callback still waiting.
 */
export function whenSplashHidden(callback: () => void): () => void {
  if (splashHidden) {
    callback();
    return () => undefined;
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
