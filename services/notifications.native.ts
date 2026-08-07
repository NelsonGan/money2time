/**
 * Native notification service using expo-notifications.
 *
 * Handles permission requests, scheduled notifications (daily check-in, weekly
 * and monthly review), immediate notifications (recurring transaction alerts),
 * and routing a notification tap back into the app.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { I18n } from '~/lib/i18n';
import type { NotificationPreferences, WeekStartsOn } from '~/types';

import {
  DAILY_CHECKIN_ID,
  LEGACY_WEEKLY_SUMMARY_ID,
  MONTHLY_REVIEW_ID,
  reviewNotificationUrl,
  WEEKLY_REVIEW_ID,
} from './notifications.shared';

export * from './notifications.shared';

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

export async function requestPermissions(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return 'granted';

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

// ---------------------------------------------------------------------------
// Foreground handler — show recurring transaction notifications in-app
// ---------------------------------------------------------------------------

export function initNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Android notification channel
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: I18n.t('notifications.channel_name'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

// ---------------------------------------------------------------------------
// Notification taps
// ---------------------------------------------------------------------------

/** Pulls the deep link out of a notification payload, if it carries one. */
function urlFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data;
  const url = data && typeof data === 'object' ? (data as Record<string, unknown>).url : null;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/**
 * Routes notification taps to `onDeepLink`.
 *
 * expo-notifications does not surface taps through `Linking`, so the payload's
 * `url` has to be replayed by hand. `getLastNotificationResponseAsync` covers
 * the cold-start case (the app was launched *by* the tap, before any listener
 * could exist); the returned response sticks around across calls, so a
 * module-level guard keeps a re-subscribe from re-navigating.
 */
let handledColdStartResponseId: string | null = null;

export function subscribeNotificationResponses(onDeepLink: (url: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = urlFromResponse(response);
    if (url) onDeepLink(url);
  });

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const identifier = response.notification.request.identifier;
    if (handledColdStartResponseId === identifier) return;
    const url = urlFromResponse(response);
    if (!url) return;
    handledColdStartResponseId = identifier;
    onDeepLink(url);
  });

  return () => subscription.remove();
}

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

export async function scheduleDailyCheckin(hour: number, minute: number): Promise<void> {
  await cancelDailyCheckin();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_CHECKIN_ID,
    content: {
      title: I18n.t('notifications.content.daily_title'),
      body: I18n.t('notifications.content.daily_body'),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelDailyCheckin(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_CHECKIN_ID);
}

// ---------------------------------------------------------------------------
// Weekly review
// ---------------------------------------------------------------------------

/**
 * `settings.weekStartsOn` is 0=Sunday..6=Saturday (the `Date.getDay()`
 * convention); expo's weekday is 1=Sunday..7=Saturday.
 */
function toExpoWeekday(weekStartsOn: WeekStartsOn): number {
  return weekStartsOn + 1;
}

/**
 * Fires on the first day of the user's week, so the week it recaps has just
 * finished. Only the time of day is user-configurable.
 */
export async function scheduleWeeklyReview(
  weekStartsOn: WeekStartsOn,
  hour: number,
  minute: number,
  body?: string,
): Promise<void> {
  await cancelWeeklyReview();
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_REVIEW_ID,
    content: {
      title: I18n.t('notifications.content.weekly_review_title'),
      body: body ?? I18n.t('notifications.content.weekly_review_body'),
      data: { url: reviewNotificationUrl('week') },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: toExpoWeekday(weekStartsOn),
      hour,
      minute,
    },
  });
}

export async function cancelWeeklyReview(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_ID);
}

// ---------------------------------------------------------------------------
// Monthly review
// ---------------------------------------------------------------------------

/**
 * Fires on the first day of the user's financial month (`firstDayOfMonth`,
 * clamped to 1..28 upstream, so the day exists in every month).
 */
export async function scheduleMonthlyReview(
  firstDayOfMonth: number,
  hour: number,
  minute: number,
  body?: string,
): Promise<void> {
  await cancelMonthlyReview();
  await Notifications.scheduleNotificationAsync({
    identifier: MONTHLY_REVIEW_ID,
    content: {
      title: I18n.t('notifications.content.monthly_review_title'),
      body: body ?? I18n.t('notifications.content.monthly_review_body'),
      data: { url: reviewNotificationUrl('month') },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: firstDayOfMonth,
      hour,
      minute,
    },
  });
}

export async function cancelMonthlyReview(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(MONTHLY_REVIEW_ID);
}

// ---------------------------------------------------------------------------
// Recurring transaction — immediate notification
// ---------------------------------------------------------------------------

export async function fireRecurringTransactionNotification(
  ruleName: string,
  amount: string,
  hours?: string,
): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== 'granted') return;

  const body = hours
    ? I18n.t('notifications.content.recurring_body_with_hours', { hours })
    : I18n.t('notifications.content.recurring_body');

  await Notifications.scheduleNotificationAsync({
    content: {
      title: I18n.t('notifications.content.recurring_title', { name: ruleName, amount }),
      body,
    },
    trigger: null, // immediate
  });
}

// ---------------------------------------------------------------------------
// Sync all scheduled notifications from prefs
// ---------------------------------------------------------------------------

export interface SyncNotificationOptions {
  /** First day of the user's week, driving when the weekly review fires. */
  weekStartsOn: WeekStartsOn;
  /** First day of the user's financial month, driving the monthly review. */
  firstDayOfMonth: number;
  /** Pre-rendered bodies carrying the closing period's figures, when known. */
  weeklyBody?: string;
  monthlyBody?: string;
}

export async function syncScheduledNotifications(
  prefs: NotificationPreferences,
  options: SyncNotificationOptions,
): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== 'granted') {
    return;
  }

  // The weekly review replaced an older "weekly summary" reminder. Cancelling
  // its identifier unconditionally clears any still-scheduled leftover.
  await Notifications.cancelScheduledNotificationAsync(LEGACY_WEEKLY_SUMMARY_ID);

  if (prefs.dailyCheckin.enabled) {
    await scheduleDailyCheckin(prefs.dailyCheckin.hour, prefs.dailyCheckin.minute);
  } else {
    await cancelDailyCheckin();
  }

  if (prefs.weeklyReview.enabled) {
    await scheduleWeeklyReview(
      options.weekStartsOn,
      prefs.weeklyReview.hour,
      prefs.weeklyReview.minute,
      options.weeklyBody,
    );
  } else {
    await cancelWeeklyReview();
  }

  if (prefs.monthlyReview.enabled) {
    await scheduleMonthlyReview(
      options.firstDayOfMonth,
      prefs.monthlyReview.hour,
      prefs.monthlyReview.minute,
      options.monthlyBody,
    );
  } else {
    await cancelMonthlyReview();
  }
}

// ---------------------------------------------------------------------------
// Cancel everything
// ---------------------------------------------------------------------------

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ---------------------------------------------------------------------------
// Test notification (dev only)
// ---------------------------------------------------------------------------

export async function fireTestNotification(
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body, ...(url ? { data: { url } } : {}) },
    trigger: null,
  });
}
