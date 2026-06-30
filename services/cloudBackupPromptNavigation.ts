/**
 * Pub/sub bridge between transaction creation (the trigger) and the
 * `<CloudBackupPromptModal>` overlay. Lets the data layer signal "a transaction
 * was just logged" without owning a React component or importing settings.
 */

export interface MaybeShowCloudBackupPromptRequest {
  /** Total transactions the user has logged, used to gate the first prompt. */
  transactionCount: number;
}

type Listener = (request: MaybeShowCloudBackupPromptRequest) => void;

const listeners = new Set<Listener>();

/** Notify subscribers. Returns the number that received the request. */
export function requestMaybeShowCloudBackupPrompt(
  request: MaybeShowCloudBackupPromptRequest,
): number {
  listeners.forEach((listener) => listener(request));
  return listeners.size;
}

export function subscribeMaybeShowCloudBackupPromptRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
