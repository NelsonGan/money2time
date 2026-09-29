/**
 * Timing probes for measuring cold start and transaction entry on a device.
 *
 * Off in every normal build. `EXPO_PUBLIC_PERF_TRACE` is inlined when the
 * bundle is built, so unless that build sets it to "1" every probe below
 * returns straight away and nothing is recorded or logged. A trace build
 * writes one `[m2t-perf] {json}` line per event to the native log (os_log on
 * iOS, the ReactNativeJS logcat tag on Android), which
 * `scripts/perf/measure.mjs` collects from a simulator or emulator.
 *
 * Two kinds of event:
 * - `startup`: wall-clock (`Date.now()`) marks from bundle start to the splash
 *   lifting, logged once, followed by a `post_launch` frame report covering the
 *   seconds after the first paint, when the other tabs mount.
 * - `interaction`: a frame report for the couple of seconds after a tap (the +
 *   button, a save). A gap between two animation frames is time the JS thread
 *   could not run anything, so the longest gap and the summed overrun are how
 *   janky the interaction felt.
 */

export const PERF_TRACE_ENABLED = process.env.EXPO_PUBLIC_PERF_TRACE === '1';

const FRAME_BUDGET_MS = 1000 / 60;
const LONG_FRAME_MS = 50;
const POST_LAUNCH_WINDOW_MS = 5000;
const INTERACTION_WINDOW_MS = 2500;

const marks: Record<string, number> = {};
let startupReported = false;

declare const __BUNDLE_START_TIME__: number | undefined;

function log(payload: Record<string, unknown>) {
  console.warn(`[m2t-perf] ${JSON.stringify(payload)}`);
}

/** Record the first time `name` is reached; later calls keep the first time. */
export function perfMark(name: string) {
  if (!PERF_TRACE_ENABLED || name in marks) return;
  marks[name] = Date.now();
}

interface FrameReport {
  firstFrameMs: number;
  maxGapMs: number;
  jankMs: number;
  longFrames: number;
  frames: number;
  settledAtMs: number;
}

function monitorFrames(windowMs: number, onDone: (report: FrameReport) => void) {
  const start = performance.now();
  let last = start;
  let firstFrameMs = -1;
  let maxGapMs = 0;
  let jankMs = 0;
  let longFrames = 0;
  let frames = 0;
  let settledAtMs = 0;
  const tick = () => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    frames += 1;
    if (firstFrameMs < 0) firstFrameMs = now - start;
    if (gap > maxGapMs) maxGapMs = gap;
    if (gap > FRAME_BUDGET_MS) jankMs += gap - FRAME_BUDGET_MS;
    if (gap > LONG_FRAME_MS) {
      longFrames += 1;
      settledAtMs = now - start;
    }
    if (now - start < windowMs) {
      requestAnimationFrame(tick);
      return;
    }
    const round = (value: number) => Math.round(value * 10) / 10;
    onDone({
      firstFrameMs: round(firstFrameMs),
      maxGapMs: round(maxGapMs),
      jankMs: round(jankMs),
      longFrames,
      frames,
      settledAtMs: round(settledAtMs),
    });
  };
  requestAnimationFrame(tick);
}

/**
 * Log the startup marks. Call once, the moment the splash is lifted onto real
 * content; `extra` carries context such as how many transactions loaded.
 */
export function perfStartupDone(extra: Record<string, unknown> = {}) {
  if (!PERF_TRACE_ENABLED || startupReported) return;
  startupReported = true;
  perfMark('splash_hide');
  const bundleStart = typeof __BUNDLE_START_TIME__ === 'number' ? __BUNDLE_START_TIME__ : null;
  log({
    kind: 'startup',
    // Metro's prelude stamps the bundle start with a monotonic clock when the
    // runtime has one, and with Date.now() otherwise. Only the latter shares a
    // clock with the marks, so pass anything else through as-is.
    bundleStart: bundleStart !== null && bundleStart > 1e12 ? bundleStart : null,
    marks: { ...marks },
    ...extra,
  });
  monitorFrames(POST_LAUNCH_WINDOW_MS, (report) => {
    log({ kind: 'post_launch', windowMs: POST_LAUNCH_WINDOW_MS, ...report });
  });
}

/** Report how the JS thread keeps up for a couple of seconds after a tap. */
export function perfInteraction(label: string, extra: Record<string, unknown> = {}) {
  if (!PERF_TRACE_ENABLED) return;
  const startedAt = Date.now();
  monitorFrames(INTERACTION_WINDOW_MS, (report) => {
    log({
      kind: 'interaction',
      label,
      startedAt,
      windowMs: INTERACTION_WINDOW_MS,
      ...report,
      ...extra,
    });
  });
}
