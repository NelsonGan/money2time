type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Ask the app shell to open the ReceiptSplit (Split by Item) editor. The
 * launch payload rides the receiptSplitBridge; this bus only triggers the
 * navigation. Subscribed in App.tsx — a module bridge like the other scan
 * navigation helpers, so ReceiptScanContext can navigate without a navigator
 * reference.
 */
export function requestOpenReceiptSplit() {
  listeners.forEach((listener) => listener());
}

export function subscribeOpenReceiptSplit(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
