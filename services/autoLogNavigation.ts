type Listener = () => void;

const listeners = new Set<Listener>();

/** Open Settings → Automation from anywhere; pair with `requestOpenTab('settings')`. */
export function requestOpenAutoLogSettings() {
  listeners.forEach((listener) => listener());
}

export function subscribeOpenAutoLogSettingsRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
