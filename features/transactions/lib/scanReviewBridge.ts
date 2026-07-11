/**
 * Hand-off for the receipt-review screen. Only the scan job's id rides here
 * (mirrors the other param-free route bridges); the review screen reads the
 * live job — its drafts, receipt, and edits — straight from ReceiptScanContext,
 * so the rows persist until the user approves, dismisses, or deletes them.
 */
let pendingJobId: string | null = null;

/** Stash the job id right before navigating to the review screen. */
export function setPendingScanReview(jobId: string) {
  pendingJobId = jobId;
}

/** Reads and clears the pending job id (null after a cold state restore). */
export function consumePendingScanReview(): string | null {
  const jobId = pendingJobId;
  pendingJobId = null;
  return jobId;
}
