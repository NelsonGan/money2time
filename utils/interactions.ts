import { InteractionManager } from 'react-native';

/**
 * Run a task after in-flight interactions/animations settle, but never later
 * than `maxDelayMs`. `InteractionManager.runAfterInteractions` alone is
 * unbounded: on slower devices a modal dismiss + tab switch + heavy re-render
 * keep registering interaction handles, so a deferred task can be starved for
 * many seconds. Preferring the after-interactions slot keeps animations smooth;
 * the timer fallback guarantees the task still lands promptly. The task is
 * guarded to run exactly once.
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
  const handle = InteractionManager.runAfterInteractions(run);
  timer = setTimeout(() => {
    handle.cancel();
    run();
  }, maxDelayMs);
}
