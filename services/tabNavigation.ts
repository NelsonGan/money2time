import type { TabName } from '~/components/navigation/BottomNav';

type OpenTabRequest = {
  tab: TabName;
};

type Listener = (request: OpenTabRequest) => void;

const listeners = new Set<Listener>();

export function requestOpenTab(tab: TabName) {
  listeners.forEach((listener) => listener({ tab }));
}

export function subscribeOpenTabRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
