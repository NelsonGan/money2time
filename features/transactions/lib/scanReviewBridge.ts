import type { ScanDraft } from '~/services/receiptScan';

/**
 * Hand-off for the multi-transaction receipt-review screen. The parsed drafts +
 * the shared receipt path are stashed here so the `ScanReview` route carries no
 * params (mirrors categoryAllocationBridge — avoids React Navigation's
 * non-serializable / state-churn warnings). Consumed once on screen mount.
 */
export interface ScanReviewSession {
  drafts: ScanDraft[];
  /** Relative receipt path (e.g. `receipts/9f3c.jpg`) attached to every saved row. */
  receiptUri: string;
}

let pending: ScanReviewSession | null = null;

/** Stash the session right before navigating to the review screen. */
export function setPendingScanReview(session: ScanReviewSession) {
  pending = session;
}

/** Reads and clears the pending session (null after a cold state restore). */
export function consumePendingScanReview(): ScanReviewSession | null {
  const session = pending;
  pending = null;
  return session;
}
