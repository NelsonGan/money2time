import type { DisplayMode, NotificationPreferences } from '~/types';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  dailyCheckin: {
    enabled: false,
    hour: 20,
    minute: 0,
  },
  recurringAlert: {
    enabled: true,
  },
  weeklySummary: {
    enabled: false,
    dayOfWeek: 1, // Monday
    hour: 10,
    minute: 0,
    displayMode: 'money' as DisplayMode,
  },
};

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// Notification identifiers for scheduling
export const DAILY_CHECKIN_ID = 'm2t-daily-checkin';
export const WEEKLY_SUMMARY_ID = 'm2t-weekly-summary';
