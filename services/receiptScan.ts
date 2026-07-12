/**
 * Web / non-native fallback for receipt scanning. Real implementation lives in
 * receiptScan.native.ts. Metro resolves this file on web/tests; both re-export
 * the shared types + pure resolver.
 */
import {
  ReceiptScanError,
  type ReceiptScanItemsResponse,
  type ReceiptScanResponse,
  type ScanReceiptArgs,
  type ScanReceiptItemsArgs,
} from './receiptScan.shared';

export * from './receiptScan.shared';

/** Not supported off-device — the native build is required. */
export async function scanReceipt(_args: ScanReceiptArgs): Promise<ReceiptScanResponse> {
  throw new ReceiptScanError(
    'not_available',
    'Receipt scanning is not available on this platform.',
  );
}

/** Not supported off-device — the native build is required. */
export async function scanReceiptItems(
  _args: ScanReceiptItemsArgs,
): Promise<ReceiptScanItemsResponse> {
  throw new ReceiptScanError(
    'not_available',
    'Receipt scanning is not available on this platform.',
  );
}
