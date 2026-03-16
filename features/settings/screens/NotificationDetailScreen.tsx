import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import type { NotificationDetailType } from '~/navigation/settingsStack';
import { triggerHaptic } from '~/services/haptics';

interface NotificationDetailScreenProps {
  type: NotificationDetailType;
  onBack: () => void;
}

function buildTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const period = h < 12 ? 'AM' : 'PM';
      const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${display}:${m === 0 ? '00' : '30'} ${period}`;
      options.push({ value: `${h}:${m}`, label });
    }
  }
  return options;
}

function buildDayOptions(): { value: string; label: string }[] {
  const keys = [
    'notifications.days.monday',
    'notifications.days.tuesday',
    'notifications.days.wednesday',
    'notifications.days.thursday',
    'notifications.days.friday',
    'notifications.days.saturday',
    'notifications.days.sunday',
  ];
  return keys.map((key, i) => ({ value: String(i + 1), label: I18n.t(key) }));
}

export function NotificationDetailScreen({ type, onBack }: NotificationDetailScreenProps) {
  const { notificationPrefs, updateNotificationPrefs } = useApp();

  const timeOptions = useMemo(buildTimeOptions, []);
  const dayOptions = useMemo(buildDayOptions, []);

  const displayModeOptions = useMemo(
    () => [
      { value: 'money', label: I18n.t('notifications.weekly_summary.show_money') },
      { value: 'time', label: I18n.t('notifications.weekly_summary.show_hours') },
    ],
    [],
  );

  const handleDailyTimeChange = useCallback(
    (val: string) => {
      void triggerHaptic('selection');
      const [h, m] = val.split(':').map(Number);
      updateNotificationPrefs({
        dailyCheckin: { ...notificationPrefs.dailyCheckin, hour: h, minute: m },
      });
    },
    [notificationPrefs.dailyCheckin, updateNotificationPrefs],
  );

  const handleWeeklyDayChange = useCallback(
    (val: string) => {
      void triggerHaptic('selection');
      updateNotificationPrefs({
        weeklySummary: { ...notificationPrefs.weeklySummary, dayOfWeek: Number(val) },
      });
    },
    [notificationPrefs.weeklySummary, updateNotificationPrefs],
  );

  const handleWeeklyTimeChange = useCallback(
    (val: string) => {
      void triggerHaptic('selection');
      const [h, m] = val.split(':').map(Number);
      updateNotificationPrefs({
        weeklySummary: { ...notificationPrefs.weeklySummary, hour: h, minute: m },
      });
    },
    [notificationPrefs.weeklySummary, updateNotificationPrefs],
  );

  const handleDisplayModeChange = useCallback(
    (val: string) => {
      void triggerHaptic('selection');
      updateNotificationPrefs({
        weeklySummary: {
          ...notificationPrefs.weeklySummary,
          displayMode: val as 'money' | 'time',
        },
      });
    },
    [notificationPrefs.weeklySummary, updateNotificationPrefs],
  );

  const isDailyCheckin = type === 'dailyCheckin';
  const title = isDailyCheckin
    ? I18n.t('notifications.daily_checkin.title')
    : I18n.t('notifications.weekly_summary.title');

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
        <View style={styles.contentBody}>
          <SettingsHeader className="px-0 pt-5 pb-3" onBack={onBack} title={title} />

          <Text variant="caption" tone="muted" className="mb-4">
            {isDailyCheckin
              ? I18n.t('notifications.daily_checkin.description')
              : I18n.t('notifications.weekly_summary.description')}
          </Text>

          {isDailyCheckin ? (
            <View style={styles.fieldGroup}>
              <SelectField
                label={I18n.t('notifications.daily_checkin.time')}
                value={`${notificationPrefs.dailyCheckin.hour}:${notificationPrefs.dailyCheckin.minute}`}
                options={timeOptions}
                onChange={handleDailyTimeChange}
              />
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <SelectField
                label={I18n.t('notifications.weekly_summary.day')}
                value={String(notificationPrefs.weeklySummary.dayOfWeek)}
                options={dayOptions}
                onChange={handleWeeklyDayChange}
              />
              <SelectField
                label={I18n.t('notifications.weekly_summary.time')}
                value={`${notificationPrefs.weeklySummary.hour}:${notificationPrefs.weeklySummary.minute}`}
                options={timeOptions}
                onChange={handleWeeklyTimeChange}
              />
              <SelectField
                label={I18n.t('notifications.weekly_summary.display_mode')}
                value={notificationPrefs.weeklySummary.displayMode}
                options={displayModeOptions}
                onChange={handleDisplayModeChange}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  fieldGroup: {
    gap: spacing.md,
  },
});
