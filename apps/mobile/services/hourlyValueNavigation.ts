type Listener = () => void;

const listeners = new Set<Listener>();

export function requestOpenHourlyValueSetup() {
  listeners.forEach((listener) => listener());
}

export function subscribeOpenHourlyValueRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
