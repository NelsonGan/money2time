import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';

/**
 * Hand-off for editing a single scanned draft in the full transaction editor.
 * The review screen stashes the draft's initial values + an `onDone` callback
 * here, then pushes the `ScanDraftEdit` route (mirrors scanReviewBridge — keeps
 * the route param-free). The editor returns the edited input through `onDone`,
 * which updates the pending row in place. Nothing is committed until the user
 * taps Approve back on the review screen.
 */
export interface ScanEditSession {
  initialValues: AddTransactionInitialValues;
  onDone: (input: CreateTransactionInput) => void;
}

let pending: ScanEditSession | null = null;

export function setScanEditSession(session: ScanEditSession) {
  pending = session;
}

/** Reads and clears the pending edit session (null after a cold state restore). */
export function consumeScanEditSession(): ScanEditSession | null {
  const session = pending;
  pending = null;
  return session;
}
