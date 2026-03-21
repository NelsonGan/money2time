type Listener = (source: string) => void;

const listeners = new Set<Listener>();

export function requestOpenPaywall(source: string) {
  listeners.forEach((listener) => listener(source));
}

export function subscribeOpenPaywallRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
