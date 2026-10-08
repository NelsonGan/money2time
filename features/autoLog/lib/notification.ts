import type { PaymentAlertParse } from '~/types';
import { extractNotificationAmounts } from '~/utils/notificationAmounts';

export const NOTIFICATION_PARSER_VERSION = 5;

/** Extract amount candidates locally; never infer transaction direction or relevance. */
export function notificationParse(text = '', currency = 'MYR'): PaymentAlertParse {
  const amounts = extractNotificationAmounts(text, currency);
  const single = amounts.length === 1 ? amounts[0] : undefined;
  return {
    kind: 'unknown',
    amount: single?.amount ?? null,
    currency: single?.currency ?? null,
    currencyToken: null,
    secondary: null,
    counterparty: null,
    counterpartyLeadIn: null,
    category: null,
    confidence: 'low',
    signals: ['notification_local_amount'],
    parserVersion: NOTIFICATION_PARSER_VERSION,
  };
}
