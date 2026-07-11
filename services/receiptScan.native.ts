/**
 * Native receipt-scan client. Reads a stored receipt as base64 and POSTs it to
 * the Cloudflare Worker (https://llm.money2time.com/scan), which holds the
 * Featherless key, verifies RevenueCat entitlement, and meters usage. Follows
 * the exchangeRates.ts fetch convention (global fetch + AbortController).
 */

import { readReceiptBase64 } from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';

import {
  ReceiptScanError,
  type ReceiptScanResponse,
  type ScanReceiptArgs,
} from './receiptScan.shared';

export * from './receiptScan.shared';

// Inference is slow (vision model); allow generous headroom over the Worker's
// own 45s upstream timeout.
const FETCH_TIMEOUT_MS = 50000;

function apiBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_RECEIPT_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export async function scanReceipt(args: ScanReceiptArgs): Promise<ReceiptScanResponse> {
  const base = apiBaseUrl();
  if (!base) {
    throw new ReceiptScanError('not_available', 'Receipt scanning is not configured.');
  }

  const image = await readReceiptBase64(args.receiptRelPath);
  if (!image) {
    throw new ReceiptScanError('server', 'Could not read the captured receipt.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        appUserId: args.appUserId,
        image: image.base64,
        mime: image.mime,
        currency: args.currency,
        categories: args.categories,
      }),
    });

    if (!response.ok) {
      throw await toScanError(response);
    }

    const body = (await response.json()) as ReceiptScanResponse;
    if (!body || !Array.isArray(body.transactions)) {
      throw new ReceiptScanError('server', 'Unexpected response from the scan service.');
    }
    return body;
  } catch (err) {
    if (err instanceof ReceiptScanError) throw err;
    // AbortError / network failure.
    throw new ReceiptScanError('network', getErrorMessage(err, 'Network request failed.'));
  } finally {
    clearTimeout(timeout);
  }
}

async function toScanError(response: Response): Promise<ReceiptScanError> {
  let payload: { error?: string; isPro?: boolean; limit?: number } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // ignore — fall through to status-based mapping
  }
  if (response.status === 402 || payload.error === 'limit_reached') {
    return new ReceiptScanError('limit_reached', 'Free scan limit reached.', {
      isPro: payload.isPro,
      limit: payload.limit,
    });
  }
  if (response.status === 429 || payload.error === 'capacity') {
    return new ReceiptScanError('capacity', 'The scanner is busy. Please try again shortly.');
  }
  return new ReceiptScanError('server', payload.error ?? `Scan failed (${response.status}).`);
}
