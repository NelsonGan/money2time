/**
 * Native client for AI notification review. Posts notification text to the
 * receipt-scanner Worker (POST /notifications), which checks the RevenueCat
 * entitlement, meters the allowance and calls the model. Only called once the
 * user has turned AI auto-review on.
 */
import { signingHeaders } from '~/services/requestSigning';
import { getErrorMessage } from '~/utils/errorHandling';

import {
  NotificationAiError,
  type NotificationAiQuota,
  type NotificationAiRequest,
  type NotificationAiResponse,
  parseNotificationAiQuota,
  parseNotificationAiResponse,
} from './notificationAi.shared';

export * from './notificationAi.shared';

// The Worker caps a batch at 50 s; this leaves room for the round trip.
const REVIEW_TIMEOUT_MS = 60000;
const QUOTA_TIMEOUT_MS = 15000;

function apiBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export function isNotificationAiAvailable(): boolean {
  return apiBaseUrl() !== null;
}

async function post(path: string, body: { appUserId: string }, timeoutMs: number) {
  const base = apiBaseUrl();
  if (!base) throw new NotificationAiError('not_available', 'AI review is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signingHeaders(body.appUserId) },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Status-based mapping below.
    }
    if (!response.ok) {
      const error = (payload as { error?: string } | null)?.error;
      if (response.status === 402 || error === 'limit_reached') {
        throw new NotificationAiError(
          'limit_reached',
          'AI review limit reached.',
          parseNotificationAiQuota(payload) ?? undefined,
        );
      }
      if (response.status === 429 || error === 'capacity') {
        throw new NotificationAiError('capacity', 'AI review is busy.');
      }
      throw new NotificationAiError(
        response.status >= 400 && response.status < 500 ? 'rejected' : 'server',
        error ?? `AI review failed (${response.status}).`,
      );
    }
    return payload;
  } catch (err) {
    if (err instanceof NotificationAiError) throw err;
    throw new NotificationAiError('network', getErrorMessage(err, 'Network request failed.'));
  } finally {
    clearTimeout(timeout);
  }
}

export async function reviewNotificationsWithAi(
  request: NotificationAiRequest,
): Promise<NotificationAiResponse> {
  const payload = await post('/notifications', request, REVIEW_TIMEOUT_MS);
  return parseNotificationAiResponse(
    payload,
    request.notifications.map((item) => item.id),
  );
}

export async function fetchNotificationAiQuota(appUserId: string): Promise<NotificationAiQuota> {
  const payload = await post('/notifications/quota', { appUserId }, QUOTA_TIMEOUT_MS);
  const quota = parseNotificationAiQuota((payload as { quota?: unknown } | null)?.quota);
  if (!quota)
    throw new NotificationAiError('server', 'Unexpected response from the review service.');
  return quota;
}
