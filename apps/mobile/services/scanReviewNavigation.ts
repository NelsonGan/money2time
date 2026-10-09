import type { AddTransactionInitialValues } from '~/navigation/rootStack';

/**
 * Payload handed from a completed single-receipt scan to a pre-filled
 * create-transaction editor, so the user reviews and edits the parsed values
 * before the transaction is saved (rather than it being added silently).
 */
export interface OpenScanReviewRequest {
  initialValues: AddTransactionInitialValues;
}

type Listener = (request: OpenScanReviewRequest) => void;

const listeners = new Set<Listener>();

/**
 * Ask the app shell to open the transaction editor pre-filled from a scanned
 * receipt. Subscribed in App.tsx.
 */
export function requestOpenScanReview(request: OpenScanReviewRequest) {
  listeners.forEach((listener) => listener(request));
}

export function subscribeOpenScanReview(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
