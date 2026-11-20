export interface OpenPaywallRequest {
  source: string;
  flashMessage?: string;
}

type Listener = (request: OpenPaywallRequest) => void;

const listeners = new Set<Listener>();

/**
 * Ask the navigator to open the paywall. Returns false when nothing is
 * listening yet (the navigator has not mounted), so a caller that must not
 * lose the request can keep it for later.
 */
export function requestOpenPaywall(source: string, flashMessage?: string): boolean {
  listeners.forEach((listener) => listener({ source, flashMessage }));
  return listeners.size > 0;
}

export function subscribeOpenPaywallRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
