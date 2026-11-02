/**
 * Web / test fallback for AI notification review. The real client lives in
 * notificationAi.native.ts; both re-export the shared types.
 */
import {
  NotificationAiError,
  type NotificationAiQuota,
  type NotificationAiRequest,
  type NotificationAiResponse,
} from './notificationAi.shared';

export * from './notificationAi.shared';

export function isNotificationAiAvailable(): boolean {
  return false;
}

export async function reviewNotificationsWithAi(
  _request: NotificationAiRequest,
): Promise<NotificationAiResponse> {
  throw new NotificationAiError('not_available', 'AI review is not available on this platform.');
}

export async function fetchNotificationAiQuota(_appUserId: string): Promise<NotificationAiQuota> {
  throw new NotificationAiError('not_available', 'AI review is not available on this platform.');
}
