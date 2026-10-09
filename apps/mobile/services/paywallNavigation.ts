export interface OpenPaywallRequest {
  source: string;
  flashMessage?: string;
}

type Listener = (request: OpenPaywallRequest) => void;

const listeners = new Set<Listener>();

export function requestOpenPaywall(source: string, flashMessage?: string) {
  listeners.forEach((listener) => listener({ source, flashMessage }));
}

export function subscribeOpenPaywallRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
