// Lightweight wake signal for Cloud Sync's outbox scheduler.
//
// SQLite triggers queue every local write into `sync_outbox`. Rather than
// waiting up to a full second for a polling timer to notice an edit, mutation
// entry points (`AppContext.runMutation`, `albumGroupWrites`) call
// `notifyLocalDataChanged()` so the scheduler wakes after a short debounce
// (coalescing rapid multi-row edits into a single push). A slower polling
// fallback in `useSyncScheduler` still catches writes from any other path.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Tells Cloud Sync that local synced tables may have new outbox rows. */
export function notifyLocalDataChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Never let a listener failure break a local write.
    }
  }
}

/** Subscribes to local write wakes. Returns an unsubscribe function. */
export function subscribeLocalDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
