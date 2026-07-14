// Module bridge for launching the ReceiptSplit screen. The launch payload
// (parsed items, seed metadata, edit target) is not serializable-friendly and
// changes shape as the flow evolves, so it rides this holder instead of route
// params — same convention as accountLogoPickerBridge / categoryAllocationBridge.
// Set the payload, then navigate('ReceiptSplit'); the screen consumes it on mount.

import type { ReceiptSplitSource } from '~/types';

export type ReceiptSplitEntryPoint = 'banner' | 'editor' | 'settleup';

export interface ReceiptSplitLaunchItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  /** Pre-flag the row for review (low OCR confidence). */
  lowConfidence?: boolean;
}

export interface ReceiptSplitLaunchSeed {
  items: ReceiptSplitLaunchItem[];
  merchant: string | null;
  /** ISO currency code; null falls back to the app's reporting currency. */
  currency: string | null;
  /** YYYY-MM-DD; null falls back to today. */
  date: string | null;
  receiptUri: string | null;
  categoryId: string | null;
  accountId: string | null;
  /** Whole-scan confidence — opens Step 1 with a warning banner when true. */
  lowConfidence?: boolean;
}

export type ReceiptSplitLaunch =
  | {
      mode: 'create';
      source: ReceiptSplitSource;
      entryPoint: ReceiptSplitEntryPoint;
      seed?: ReceiptSplitLaunchSeed;
    }
  | {
      mode: 'edit';
      transactionId: string;
      entryPoint: ReceiptSplitEntryPoint;
    };

let pendingLaunch: ReceiptSplitLaunch | null = null;

export function setReceiptSplitLaunch(launch: ReceiptSplitLaunch): void {
  pendingLaunch = launch;
}

/** One-shot read: returns the pending launch and clears it. */
export function consumeReceiptSplitLaunch(): ReceiptSplitLaunch | null {
  const launch = pendingLaunch;
  pendingLaunch = null;
  return launch;
}
