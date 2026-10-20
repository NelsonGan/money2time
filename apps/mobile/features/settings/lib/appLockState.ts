/**
 * Whether the app lock overlay is showing, for code that must not act behind
 * it: a native alert draws above the overlay, so a prompt that hands data to
 * someone else has to wait for the person to unlock first.
 */
let locked = false;
const waiters = new Set<() => void>();

export function setAppLocked(next: boolean) {
  locked = next;
  if (next) return;
  for (const resolve of waiters) resolve();
  waiters.clear();
}

/** Resolves at once when the app is unlocked, otherwise when the person unlocks it. */
export function whenAppUnlocked(): Promise<void> {
  if (!locked) return Promise.resolve();
  return new Promise((resolve) => waiters.add(resolve));
}
