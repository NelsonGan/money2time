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
 * Ask the app shell to raise the receipt-scan camera. Subscribed by
 * `ReceiptCameraSheet`, which the shell mounts once above the navigator and
 * which shows the viewfinder as a bottom sheet over the current screen — there
 * is no camera route to push. Kept as a module bridge, like the other scan
 * navigation helpers, so the ReceiptScanContext can raise it without holding a
 * reference to the sheet or the navigator.
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
