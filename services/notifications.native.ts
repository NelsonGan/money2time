/**
 * Native notification service using expo-notifications.
 *
 * Handles permission requests, scheduled notifications (daily check-in,
 * weekly summary), and immediate notifications (recurring transaction alerts).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { I18n } from '~/lib/i18n';
import type { NotificationPreferences } from '~/types';

import { DAILY_CHECKIN_ID, WEEKLY_SUMMARY_ID } from './notifications.shared';

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
// Weekly summary
// ---------------------------------------------------------------------------

// expo-notifications uses 1=Sunday..7=Saturday, but our UI uses 1=Monday..7=Sunday
function toExpoWeekday(dayOfWeek: number): number {
  // Our format: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
  // Expo format: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
  return dayOfWeek === 7 ? 1 : dayOfWeek + 1;
}

export async function scheduleWeeklySummary(
  dayOfWeek: number,
  hour: number,
  minute: number,
  body?: string,
): Promise<void> {
  await cancelWeeklySummary();
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_SUMMARY_ID,
    content: {
      title: I18n.t('notifications.content.weekly_title'),
      body: body ?? I18n.t('notifications.content.weekly_body'),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: toExpoWeekday(dayOfWeek),
      hour,
      minute,
    },
  });
}

export async function cancelWeeklySummary(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID);
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

export async function syncScheduledNotifications(
  prefs: NotificationPreferences,
  weeklyBody?: string,
): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== 'granted') {
    return;
  }

  // Daily check-in
  if (prefs.dailyCheckin.enabled) {
    await scheduleDailyCheckin(prefs.dailyCheckin.hour, prefs.dailyCheckin.minute);
  } else {
    await cancelDailyCheckin();
  }

  // Weekly summary
  if (prefs.weeklySummary.enabled) {
    await scheduleWeeklySummary(
      prefs.weeklySummary.dayOfWeek,
      prefs.weeklySummary.hour,
      prefs.weeklySummary.minute,
      weeklyBody,
    );
  } else {
    await cancelWeeklySummary();
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

export async function fireTestNotification(title: string, body: string): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}
