// TEMPORARY startup-lag instrumentation. __DEV__-only; compiles out of release
// builds. Remove once the cold-start block is diagnosed.
const START = Date.now();

/** Log a checkpoint with elapsed ms since this module first loaded. */
export function perfMark(label: string): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.warn(`[perf] +${Date.now() - START}ms  ${label}`);
}

/** Time a synchronous function; warn only when it exceeds the threshold. */
export function perfSpan<T>(label: string, fn: () => T, thresholdMs = 30): T {
  if (!__DEV__) return fn();
  const t = Date.now();
  const out = fn();
  const d = Date.now() - t;
  if (d >= thresholdMs) {
    // eslint-disable-next-line no-console
    console.warn(`[perf] ${label} took ${d}ms  (finished @+${Date.now() - START}ms)`);
  }
  return out;
}
