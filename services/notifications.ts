/**
 * Web / unsupported-platform fallback for notifications.
 *
 * All functions are safe no-ops so the rest of the app can import from
 * `~/services/notifications` without platform guards.
 */

import type { NotificationPreferences, WeekStartsOn } from '~/types';

export * from './notifications.shared';

export interface SyncNotificationOptions {
  weekStartsOn: WeekStartsOn;
  firstDayOfMonth: number;
  weeklyBody?: string;
  monthlyBody?: string;
}

export async function requestPermissions(): Promise<'granted' | 'denied' | 'undetermined'> {
  return 'denied';
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  return 'denied';
}

export function initNotificationHandler(): void {}

export function subscribeNotificationResponses(_onDeepLink: (url: string) => void): () => void {
  return () => {};
}

export async function scheduleDailyCheckin(_hour: number, _minute: number): Promise<void> {}

export async function cancelDailyCheckin(): Promise<void> {}

export async function scheduleWeeklyReview(
  _weekStartsOn: WeekStartsOn,
  _hour: number,
  _minute: number,
  _body?: string,
): Promise<void> {}

export async function cancelWeeklyReview(): Promise<void> {}

export async function scheduleMonthlyReview(
  _firstDayOfMonth: number,
  _hour: number,
  _minute: number,
  _body?: string,
): Promise<void> {}

export async function cancelMonthlyReview(): Promise<void> {}

export async function fireRecurringTransactionNotification(
  _ruleName: string,
  _amount: string,
  _hours?: string,
): Promise<void> {}

export async function syncScheduledNotifications(
  _prefs: NotificationPreferences,
  _options: SyncNotificationOptions,
): Promise<void> {}

export async function cancelAllNotifications(): Promise<void> {}

export async function fireTestNotification(
  _title: string,
  _body: string,
  _url?: string,
): Promise<void> {}
