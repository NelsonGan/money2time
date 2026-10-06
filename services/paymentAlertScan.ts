import { CURRENCY_CODES } from '~/utils/moneyText';

import { ReceiptScanError, type ScannedTransaction } from './receiptScan.shared';
import { postReceiptScan } from './receiptScannerRequest';

export interface ScanPaymentAlertArgs {
  appUserId: string;
  currency: string;
  categories: string[];
  incomeCategories: string[];
  notification: {
    title: string | null;
    subtitle: string | null;
    body: string | null;
    extra: string[];
    source: string;
    capturedAt: string;
  };
}

/** One completed expense/income, or null for a notification that should be skipped. */
export async function scanPaymentAlert(
  args: ScanPaymentAlertArgs,
): Promise<ScannedTransaction | null> {
  const response = await postReceiptScan({
    ...args,
    notification: boundedNotification(args.notification),
    mode: 'notification',
  });
  if (response.transactions.length === 0) return null;
  if (response.transactions.length !== 1)
    throw new ReceiptScanError('server', 'Invalid notification transaction.');
  return notificationTransactionOf(response.transactions[0]);
}

/** Rich Android extras can exceed the worker limit even with native per-field caps. */
function boundedNotification(
  input: ScanPaymentAlertArgs['notification'],
): ScanPaymentAlertArgs['notification'] {
  const notification = {
    ...input,
    source: input.source.slice(0, 256),
    capturedAt: input.capturedAt.slice(0, 64),
    extra: [...input.extra],
  };
  while (JSON.stringify(notification).length > 16000) {
    // Ancillary details go first; preserve the transaction body and title.
    if (notification.extra.length > 0) {
      notification.extra.pop();
      continue;
    }
    if (notification.subtitle) {
      notification.subtitle = null;
      continue;
    }
    const key =
      (notification.body?.length ?? 0) > (notification.title?.length ?? 0) ? 'body' : 'title';
    notification[key] =
      notification[key]?.slice(0, Math.floor((notification[key]?.length ?? 0) / 2)) ?? null;
  }
  return notification;
}

/** Validate both fresh inference and persisted results reused after a failed save. */
export function notificationTransactionOf(value: unknown): ScannedTransaction {
  if (!value || typeof value !== 'object')
    throw new ReceiptScanError('server', 'Invalid notification transaction.');
  const row = value as ScannedTransaction;
  if (
    (row.type !== 'expense' && row.type !== 'income') ||
    typeof row.amount !== 'number' ||
    !Number.isFinite(row.amount) ||
    row.amount <= 0 ||
    typeof row.currency !== 'string' ||
    !CURRENCY_CODES.has(row.currency) ||
    typeof row.category !== 'string' ||
    typeof row.note !== 'string'
  )
    throw new ReceiptScanError('server', 'Invalid notification transaction.');
  if (
    row.secondary !== undefined &&
    row.secondary !== null &&
    (typeof row.secondary !== 'object' ||
      typeof row.secondary.amount !== 'number' ||
      !Number.isFinite(row.secondary.amount) ||
      row.secondary.amount <= 0 ||
      !CURRENCY_CODES.has(row.secondary.currency))
  )
    throw new ReceiptScanError('server', 'Invalid notification billed amount.');
  return { ...row, date: null, sentiment: 'neutral', note: row.note.trim() };
}
