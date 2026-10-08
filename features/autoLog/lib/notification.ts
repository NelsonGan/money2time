import {
  type NotificationScanResponse,
  validateNotificationScanResponse,
} from '~/services/receiptScan.shared';
import type { PaymentAlertParse } from '~/types';

// Version 4 replaces local keyword parsing with the scanner's strict contract.
export const NOTIFICATION_PARSER_VERSION = 4;

export function notificationParse(
  response?: NotificationScanResponse,
  scanCurrency?: string,
): PaymentAlertParse {
  const row = response ? validateNotificationScanResponse(response).transactions[0] : undefined;
  return {
    kind: row ? (row.type === 'income' ? 'income' : 'spend') : 'unknown',
    amount: row?.amount ?? null,
    currency: row?.currency ?? null,
    currencyToken: null,
    secondary: row?.secondary ?? null,
    counterparty: row?.note?.trim() || null,
    counterpartyLeadIn: null,
    category: row?.category ?? null,
    ...(scanCurrency ? { scanCurrency } : {}),
    confidence: row ? 'high' : 'low',
    signals: ['notification_scanner'],
    parserVersion: NOTIFICATION_PARSER_VERSION,
  };
}
