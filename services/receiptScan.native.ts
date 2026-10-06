/**
 * Native receipt-scan client. Reads a stored receipt as base64 and POSTs it to
 * the Cloudflare Worker (https://workers-receipt-scanner.money2time.com/scan), which holds the
 * OpenRouter key, verifies RevenueCat entitlement, and meters usage. Follows
 * the exchangeRates.ts fetch convention (global fetch + AbortController).
 */

import { readReceiptBase64 } from '~/services/userAssets';

import {
  ReceiptScanError,
  type ReceiptScanResponse,
  type ScanReceiptArgs,
} from './receiptScan.shared';
import { postReceiptScan } from './receiptScannerRequest';

export * from './receiptScan.shared';

// Fail fast before uploading a large image to the shared scan transport.
const MAX_IMAGE_BASE64_BYTES = 8 * 1024 * 1024;

export async function scanReceipt(args: ScanReceiptArgs): Promise<ReceiptScanResponse> {
  const image = await readReceiptBase64(args.receiptRelPath);
  if (!image) throw new ReceiptScanError('server', 'Could not read the captured receipt.');
  if (image.base64.length > MAX_IMAGE_BASE64_BYTES) {
    throw new ReceiptScanError('too_large', 'The receipt photo is too large to scan.');
  }
  return postReceiptScan({
    image: image.base64,
    mime: image.mime,
    appUserId: args.appUserId,
    currency: args.currency,
    categories: args.categories,
    ...(args.mode ? { mode: args.mode } : {}),
    ...(args.accounts && args.accounts.length > 0 ? { accounts: args.accounts } : {}),
  });
}
