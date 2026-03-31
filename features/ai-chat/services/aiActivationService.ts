type ActivationStateListener = () => void;

let activationError: string | null = null;
const listeners = new Set<ActivationStateListener>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToActivationState(listener: ActivationStateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivationError(): string | null {
  return activationError;
}

export function setActivationError(nextError: string | null): void {
  if (activationError === nextError) return;
  activationError = nextError;
  emitChange();
}
