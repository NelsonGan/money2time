type OpenTransactionsRequest = {
  monthKey: string | null;
  /** Day (YYYY-MM-DD) to scroll to within the focused month, if any. */
  dayKey?: string | null;
};

type Listener = (request: OpenTransactionsRequest) => void;

const listeners = new Set<Listener>();

export function requestOpenTransactions(request: OpenTransactionsRequest) {
  listeners.forEach((listener) => listener(request));
}

export function subscribeOpenTransactionsRequest(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
