/**
 * Native receipt-scan client. Reads a stored receipt as base64 and POSTs it to
 * the Cloudflare Worker (https://workers-receipt-scanner.money2time.com/scan), which holds the
 * OpenRouter key, verifies RevenueCat entitlement, and meters usage. Follows
 * the exchangeRates.ts fetch convention (global fetch + AbortController).
 */

import { sha256 } from 'js-sha256';

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

// The Worker rejects base64 payloads over this size (MAX_IMAGE_BYTES on the
// server) — checking here fails fast instead of uploading megabytes to a 400.
const MAX_IMAGE_BASE64_BYTES = 8 * 1024 * 1024;

function apiBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

/**
 * Shared-secret request signature. When a signing key is configured, sign
 * `<timestamp>.<appUserId>` with HMAC-SHA256 and send it alongside the request;
 * the Worker recomputes and validates it (rejecting stale or unsigned calls).
 * Returns no headers when the key is unset so preview/dev builds still work.
 */
function signingHeaders(appUserId: string): Record<string, string> {
  const key = process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY?.trim();
  if (!key) return {};
  const timestamp = Date.now().toString();
  const signature = sha256.hmac(key, `${timestamp}.${appUserId}`);
  return { 'X-Timestamp': timestamp, 'X-Signature': signature };
}

export async function scanReceipt(args: ScanReceiptArgs): Promise<ReceiptScanResponse> {
  const body = await postScan(args.receiptRelPath, {
    appUserId: args.appUserId,
    currency: args.currency,
    categories: args.categories,
    ...(args.mode ? { mode: args.mode } : {}),
    ...(args.accounts && args.accounts.length > 0 ? { accounts: args.accounts } : {}),
  });
  const response = body as ReceiptScanResponse;
  if (!response || !Array.isArray(response.transactions)) {
    throw new ReceiptScanError('server', 'Unexpected response from the scan service.');
  }
  return response;
}

/** Shared request pipeline for the scan: read the stored image, POST it with a
 *  timeout, and map failures onto ReceiptScanError codes. */
async function postScan(
  receiptRelPath: string,
  extraBody: Record<string, unknown>,
): Promise<unknown> {
  const base = apiBaseUrl();
  if (!base) {
    throw new ReceiptScanError('not_available', 'Receipt scanning is not configured.');
  }

  const image = await readReceiptBase64(receiptRelPath);
  if (!image) {
    throw new ReceiptScanError('server', 'Could not read the captured receipt.');
  }
  if (image.base64.length > MAX_IMAGE_BASE64_BYTES) {
    throw new ReceiptScanError('too_large', 'The receipt photo is too large to scan.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signingHeaders(String(extraBody.appUserId ?? '')),
      },
      signal: controller.signal,
      body: JSON.stringify({ image: image.base64, mime: image.mime, ...extraBody }),
    });

    if (!response.ok) {
      throw await toScanError(response);
    }
    return (await response.json()) as unknown;
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
  if (payload.error === 'image_too_large') {
    return new ReceiptScanError('too_large', 'The receipt photo is too large to scan.');
  }
  return new ReceiptScanError('server', payload.error ?? `Scan failed (${response.status}).`);
}
