// Asks for the post-purchase Cloud Sync offer. The paywall calls it after a
// successful purchase; CloudSyncPromptHost shows the offer once the paywall
// has closed and no other prompt is on screen.

type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function requestCloudSyncPrompt(): void {
  pending = true;
  listeners.forEach((listener) => listener());
}

export function takePendingCloudSyncPrompt(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function hasPendingCloudSyncPrompt(): boolean {
  return pending;
}

export function subscribeCloudSyncPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
