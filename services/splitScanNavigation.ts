import type { SplitDraft } from '~/features/transactions/components/editor';

/**
 * Payload handed from a "ready" split-scan job to the editor: the parsed
 * receipt as itemized split rows plus the context needed to open a fresh
 * expense (total, currency, attached receipt).
 */
export interface OpenSplitScanRequest {
  /** Itemized split rows; the editor derives the expense total from them. */
  splits: SplitDraft[];
  currency: string;
  /** Relative receipt path to attach to the created expense. */
  receiptUri: string;
  /** Merchant name from the receipt, used as the transaction note. */
  merchant: string;
  /** Category inferred from the merchant + items, so the expense is pre-categorized. */
  categoryId?: string | null;
}

type Listener = (request: OpenSplitScanRequest) => void;

const listeners = new Set<Listener>();

/**
 * Ask the app shell to open the transaction editor on a new expense with the
 * split sheet pre-loaded from a scanned receipt. Subscribed in App.tsx.
 */
export function requestOpenSplitScan(request: OpenSplitScanRequest) {
  listeners.forEach((listener) => listener(request));
}

export function subscribeOpenSplitScan(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
