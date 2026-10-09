/**
 * Blocks the calling thread for `ms` milliseconds. Deliberately synchronous:
 * callers use this between retries of `expo-sqlite`'s synchronous API at app
 * boot, before there is anything async to `await`, so a real (if brief)
 * pause between attempts has to be a busy-wait rather than a `setTimeout`.
 */
export function busyWaitSync(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // intentionally empty
  }
}
