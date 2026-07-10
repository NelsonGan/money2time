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

type HighlightListener = (transactionId: string) => void;

const highlightListeners = new Set<HighlightListener>();

/**
 * Ask any mounted transaction list to briefly flash the given row — used right
 * after a create so the user can spot the transaction they just added. Lists
 * that don't contain the id ignore it.
 */
export function requestHighlightTransaction(transactionId: string) {
  highlightListeners.forEach((listener) => listener(transactionId));
}

export function subscribeHighlightTransaction(listener: HighlightListener) {
  highlightListeners.add(listener);
  return () => {
    highlightListeners.delete(listener);
  };
}
