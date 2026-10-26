export type InteractionTask = { cancel: () => void };

/**
 * Run a task on the next turn of the event loop, after the current render and
 * any touch handling have finished.
 *
 * This replaces React Native's `InteractionManager.runAfterInteractions`,
 * which React Native 0.88 removed (accessing it throws in development and is
 * `undefined` in release builds). It keeps the exact timing the app already
 * had: since React Native 0.80 the `disableInteractionManager` flag defaulted
 * to on, and the stub it switched to ran every task with `setImmediate`
 * instead of waiting for interaction handles.
 */
export function runAfterInteractions(task: () => void): InteractionTask {
  const id = setImmediate(task);
  return { cancel: () => clearImmediate(id) };
}

/**
 * Run a task after in-flight interactions/animations settle, but never later
 * than `maxDelayMs`. The after-interactions slot keeps animations smooth; the
 * timer fallback guarantees the task still lands promptly if that slot ever
 * stops being prompt. The task is guarded to run exactly once.
 */
export function runAfterInteractionsCapped(task: () => void, maxDelayMs: number) {
  let ran = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (ran) return;
    ran = true;
    if (timer) clearTimeout(timer);
    task();
  };
  const handle = runAfterInteractions(run);
  timer = setTimeout(() => {
    handle.cancel();
    run();
  }, maxDelayMs);
}
