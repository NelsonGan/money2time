import { signingHeaders } from '~/services/requestSigning';
import { getErrorMessage } from '~/utils/errorHandling';

import { ReceiptScanError, type ReceiptScanResponse } from './receiptScan.shared';

/** Shared signed transport for receipt images and notification text. */
export async function postReceiptScan(body: Record<string, unknown>): Promise<ReceiptScanResponse> {
  const base = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER?.trim().replace(
    /\/+$/,
    '',
  );
  if (!base) throw new ReceiptScanError('not_available', 'Scanning is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${base}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signingHeaders(String(body.appUserId ?? '')),
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await toScanError(response, body.mode === 'notification');
    const result = (await response.json()) as ReceiptScanResponse;
    if (!result || !Array.isArray(result.transactions)) {
      throw new ReceiptScanError('server', 'Unexpected response from the scan service.');
    }
    return result;
  } catch (error) {
    if (error instanceof ReceiptScanError) throw error;
    throw new ReceiptScanError(
      'network',
      body.mode === 'notification'
        ? 'Notification scan request failed.'
        : getErrorMessage(error, 'Network request failed.'),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function toScanError(response: Response, notification: boolean): Promise<ReceiptScanError> {
  let payload: { error?: string; isPro?: boolean; limit?: number } = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') payload = parsed as typeof payload;
  } catch {
    /* Use HTTP status. */
  }
  if (response.status === 402 || payload.error === 'limit_reached') {
    return new ReceiptScanError('limit_reached', 'Scan limit reached.', {
      isPro: payload.isPro,
      limit: payload.limit,
    });
  }
  if (response.status === 429 || payload.error === 'capacity') {
    return new ReceiptScanError('capacity', 'The scanner is busy. Please try again shortly.');
  }
  if (payload.error === 'image_too_large' || payload.error === 'notification_too_large') {
    return new ReceiptScanError('too_large', 'The scan input is too large.');
  }
  return new ReceiptScanError(
    'server',
    notification
      ? `Scan failed (${response.status}).`
      : (payload.error ?? `Scan failed (${response.status}).`),
  );
}
