/**
 * Why the scan was started — 'split' routes the result into Split by Item;
 * 'screenshot' is the auto-log screenshot path (Worker screenshot mode with
 * account detection, silent auto-create). Only 'quick' and 'split' ever open
 * the camera — a screenshot arrives already captured, via the App Group queue.
 */
export type ScanIntent = 'quick' | 'split' | 'screenshot';

type Listener = (intent: ScanIntent) => void;

const listeners = new Set<Listener>();

/**
 * Ask the app shell to open the full-screen receipt-scan camera. Subscribed in
 * App.tsx (navigates to the `ScanReceiptCamera` root screen). Kept as a module
 * bridge — like the other scan navigation helpers — so the ReceiptScanContext
 * can trigger navigation without holding a navigator reference.
 */
export function requestOpenScanCamera(intent: ScanIntent = 'quick') {
  listeners.forEach((listener) => listener(intent));
}

export function subscribeOpenScanCamera(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
