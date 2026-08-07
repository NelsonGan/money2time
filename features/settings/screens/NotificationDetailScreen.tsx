import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import type { NotificationDetailType } from '~/navigation/settingsStack';
import { triggerHaptic } from '~/services/haptics';
import type { DisplayMode } from '~/types';
import { formatTimeOfDay } from '~/utils/formatters';

import { reviewReminderDayLabel } from './notificationCopy';

interface NotificationDetailScreenProps {
  type: NotificationDetailType;
  onBack: () => void;
}

function buildTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      options.push({ value: `${h}:${m}`, label: formatTimeOfDay(h, m) });
    }
  }
  return options;
}

export function NotificationDetailScreen({ type, onBack }: NotificationDetailScreenProps) {
  const { notificationPrefs, updateNotificationPrefs, settings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();

  const timeOptions = useMemo(buildTimeOptions, []);

  const displayModeOptions = useMemo(
    () => [
      { value: 'money', label: I18n.t('notifications.review.show_money') },
      { value: 'time', label: I18n.t('notifications.review.show_hours') },
    ],
    [],
  );

  const isReview = type === 'weeklyReview' || type === 'monthlyReview';
  const reviewKey = type === 'monthlyReview' ? 'monthlyReview' : 'weeklyReview';
  const reviewPrefs = notificationPrefs[reviewKey];

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

  const handleReviewTimeChange = useCallback(
    (val: string) => {
      void triggerHaptic('selection');
      const [h, m] = val.split(':').map(Number);
      updateNotificationPrefs({ [reviewKey]: { ...reviewPrefs, hour: h, minute: m } });
    },
    [reviewKey, reviewPrefs, updateNotificationPrefs],
  );

  const handleReviewDisplayModeChange = useCallback(
    (val: string) => {
      void triggerHaptic('selection');
      updateNotificationPrefs({
        [reviewKey]: { ...reviewPrefs, displayMode: val as DisplayMode },
      });
    },
    [reviewKey, reviewPrefs, updateNotificationPrefs],
  );

  const title = isReview
    ? I18n.t(`notifications.${type === 'monthlyReview' ? 'monthly_review' : 'weekly_review'}.title`)
    : I18n.t('notifications.daily_checkin.title');
  const description = isReview
    ? I18n.t(
        `notifications.${type === 'monthlyReview' ? 'monthly_review' : 'weekly_review'}.description`,
      )
    : I18n.t('notifications.daily_checkin.description');

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.contentBody}>
          <SettingsHeader className="px-0 pt-5 pb-3" onBack={onBack} title={title} />

          <Text variant="caption" tone="muted" className="mb-4">
            {description}
          </Text>

          {isReview ? (
            <View style={styles.fieldGroup}>
              {/* The day is not a choice here: a review only makes sense once the
                  period has closed, so it follows the week / month start set in
                  Display settings. Shown read-only with a pointer to where it
                  lives. */}
              <View className="rounded-2xl border border-border/30 bg-card px-4 py-3">
                <Text variant="caption" tone="muted">
                  {I18n.t('notifications.review.fires_on')}
                </Text>
                <Text variant="bodyStrong" className="mt-0.5 text-foreground">
                  {reviewReminderDayLabel(reviewKey, settings)}
                </Text>
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('notifications.review.fires_on_hint')}
                </Text>
              </View>
              <SelectField
                label={I18n.t('notifications.review.time')}
                value={`${reviewPrefs.hour}:${reviewPrefs.minute}`}
                options={timeOptions}
                onChange={handleReviewTimeChange}
              />
              <SelectField
                label={I18n.t('notifications.review.display_mode')}
                value={reviewPrefs.displayMode}
                options={displayModeOptions}
                onChange={handleReviewDisplayModeChange}
              />
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <SelectField
                label={I18n.t('notifications.daily_checkin.time')}
                value={`${notificationPrefs.dailyCheckin.hour}:${notificationPrefs.dailyCheckin.minute}`}
                options={timeOptions}
                onChange={handleDailyTimeChange}
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
