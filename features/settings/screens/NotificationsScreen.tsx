import {
  Bell,
  CalendarCheck,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  RefreshCw,
  TrendingUp,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Mascot } from '~/components/feedback/Mascot';
import {
  Button,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { NotificationDetailType } from '~/navigation/settingsStack';
import { triggerHaptic } from '~/services/haptics';
import { FONT } from '~/utils/fonts';
import {
  fireTestNotification,
  getPermissionStatus,
  type PermissionStatus,
  requestPermissions,
} from '~/services/notifications';
import { formatTimeOfDay } from '~/utils/formatters';

interface NotificationsScreenProps {
  onBack: () => void;
  onOpenDetail: (type: NotificationDetailType) => void;
}

function getDayName(day: number): string {
  const keys = [
    'notifications.days.monday',
    'notifications.days.tuesday',
    'notifications.days.wednesday',
    'notifications.days.thursday',
    'notifications.days.friday',
    'notifications.days.saturday',
    'notifications.days.sunday',
  ];
  return I18n.t(keys[day - 1] ?? keys[0]);
}

export function NotificationsScreen({ onBack, onOpenDetail }: NotificationsScreenProps) {
  const { notificationPrefs, updateNotificationPrefs } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');

  useEffect(() => {
    void getPermissionStatus().then(setPermissionStatus);
  }, []);

  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    if (permissionStatus === 'granted') return true;
    const status = await requestPermissions();
    setPermissionStatus(status);
    if (status === 'denied') {
      Alert.alert(
        I18n.t('notifications.permission_denied_title'),
        I18n.t('notifications.permission_denied_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('notifications.open_settings'),
            onPress: () => void Linking.openSettings(),
          },
        ],
      );
      return false;
    }
    return status === 'granted';
  }, [permissionStatus]);

  const toggleDailyCheckin = useCallback(
    async (value: boolean) => {
      void triggerHaptic('selection');
      if (value) {
        const granted = await ensurePermissions();
        if (!granted) return;
      }
      updateNotificationPrefs({
        dailyCheckin: { ...notificationPrefs.dailyCheckin, enabled: value },
      });
    },
    [ensurePermissions, notificationPrefs.dailyCheckin, updateNotificationPrefs],
  );

  const toggleRecurringAlert = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateNotificationPrefs({
        recurringAlert: { enabled: value },
      });
    },
    [updateNotificationPrefs],
  );

  const toggleWeeklySummary = useCallback(
    async (value: boolean) => {
      void triggerHaptic('selection');
      if (value) {
        const granted = await ensurePermissions();
        if (!granted) return;
      }
      updateNotificationPrefs({
        weeklySummary: { ...notificationPrefs.weeklySummary, enabled: value },
      });
    },
    [ensurePermissions, notificationPrefs.weeklySummary, updateNotificationPrefs],
  );

  const dailySubtitle = formatTimeOfDay(
    notificationPrefs.dailyCheckin.hour,
    notificationPrefs.dailyCheckin.minute,
  );

  const weeklySubtitle = `${getDayName(notificationPrefs.weeklySummary.dayOfWeek)} ${formatTimeOfDay(notificationPrefs.weeklySummary.hour, notificationPrefs.weeklySummary.minute)}`;

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.contentBody}>
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('notifications.title')}
            subtitle={I18n.t('notifications.subtitle')}
          />

          <View className="items-center pt-1 pb-3">
            <Mascot size={96} name="announce" animate />
          </View>

          {permissionStatus === 'denied' && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={[styles.permissionBanner, { backgroundColor: `${themeColors.accent}14` }]}
              className="rounded-2xl border border-accent/20"
            >
              <View style={styles.permissionBannerContent}>
                <Bell size={18} color={themeColors.accent} />
                <View style={styles.permissionBannerText}>
                  <Text variant="bodyStrong" className="text-foreground">
                    {I18n.t('notifications.permission_required')}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-1">
                    {I18n.t('notifications.permission_required_message')}
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onPress={() => void Linking.openSettings()}
              >
                <ExternalLink size={14} color={themeColors.text} />
                <Text>{I18n.t('notifications.open_settings')}</Text>
              </Button>
            </Animated.View>
          )}

          <Animated.View entering={FadeIn.delay(100).duration(350)} style={styles.cardList}>
            {/* Daily Check-in */}
            <NotificationCard
              icon={<CalendarCheck size={18} color={themeColors.primary} />}
              title={I18n.t('notifications.daily_checkin.label')}
              description={I18n.t('notifications.daily_checkin.description')}
              status={dailySubtitle}
              enabled={notificationPrefs.dailyCheckin.enabled}
              onToggle={(val) => void toggleDailyCheckin(val)}
              onPress={() => {
                void triggerHaptic('selection');
                onOpenDetail('dailyCheckin');
              }}
              onTest={() => {
                void fireTestNotification(
                  I18n.t('notifications.content.daily_title'),
                  I18n.t('notifications.content.daily_body'),
                );
                void triggerHaptic('success');
              }}
              themeColors={themeColors}
            />

            {/* Recurring Transactions */}
            <NotificationCard
              icon={<RefreshCw size={18} color={themeColors.primary} />}
              title={I18n.t('notifications.recurring.label')}
              description={I18n.t('notifications.recurring.description')}
              enabled={notificationPrefs.recurringAlert.enabled}
              onToggle={toggleRecurringAlert}
              onTest={() => {
                void fireTestNotification(
                  I18n.t('notifications.content.recurring_title'),
                  I18n.t('notifications.content.recurring_body', {
                    name: 'Netflix',
                    amount: '$15.99',
                  }),
                );
                void triggerHaptic('success');
              }}
              themeColors={themeColors}
            />

            {/* Weekly Summary */}
            <NotificationCard
              icon={<TrendingUp size={18} color={themeColors.primary} />}
              title={I18n.t('notifications.weekly_summary.label')}
              description={I18n.t('notifications.weekly_summary.description')}
              status={weeklySubtitle}
              enabled={notificationPrefs.weeklySummary.enabled}
              onToggle={(val) => void toggleWeeklySummary(val)}
              onPress={() => {
                void triggerHaptic('selection');
                onOpenDetail('weeklySummary');
              }}
              onTest={() => {
                void fireTestNotification(
                  I18n.t('notifications.content.weekly_title'),
                  I18n.t('notifications.content.weekly_body'),
                );
                void triggerHaptic('success');
              }}
              themeColors={themeColors}
            />
          </Animated.View>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

// ---------------------------------------------------------------------------
// Card component for each notification type
// ---------------------------------------------------------------------------

interface NotificationCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status?: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  onPress?: () => void;
  onTest?: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}

function NotificationCard({
  icon,
  title,
  description,
  status,
  enabled,
  onToggle,
  onPress,
  onTest,
  themeColors,
}: NotificationCardProps) {
  const showFooter = onPress || (__DEV__ && onTest);
  return (
    <View className="rounded-2xl border border-border/30 bg-card shadow-soft" style={styles.card}>
      <View style={styles.cardHeader}>
        <View
          className="items-center justify-center rounded-xl bg-primary/8 border border-primary/10"
          style={styles.cardIcon}
        >
          {icon}
        </View>
        <View style={styles.cardTitleBlock}>
          <View style={styles.cardTitleRow}>
            <Text
              variant="bodyStrong"
              className="text-foreground"
              style={styles.cardTitle}
              numberOfLines={1}
            >
              {title}
            </Text>
            {status ? (
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: enabled
                      ? `${themeColors.primary}18`
                      : `${themeColors.border}40`,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[
                    styles.statusText,
                    { color: enabled ? themeColors.primary : themeColors.muted },
                  ]}
                >
                  {status}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" className="text-foreground/60 mt-0.5" numberOfLines={2}>
            {description}
          </Text>
        </View>
        <Switch
          style={styles.switchSmall}
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
      {showFooter ? (
        <View style={[styles.cardFooter, { borderTopColor: `${themeColors.border}25` }]}>
          {onPress ? (
            <Pressable onPress={onPress} style={styles.footerLink}>
              <Text variant="caption" tone="primary" className="text-primary">
                {I18n.t('notifications.customize')}
              </Text>
              <ChevronRight size={11} color={themeColors.primary} />
            </Pressable>
          ) : (
            <View />
          )}
          {__DEV__ && onTest ? (
            <Text variant="caption" tone="muted" onPress={onTest} style={styles.footerLink}>
              <FlaskConical size={11} color={themeColors.muted} />
              {'  '}
              {I18n.t('notifications.send_test')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  permissionBanner: {
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  permissionBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  permissionBannerText: {
    flex: 1,
  },
  cardList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  card: {
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cardIcon: {
    width: 36,
    height: 36,
    flexShrink: 0,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'nowrap',
  },
  cardTitle: {
    flexShrink: 0,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  statusText: {
    fontSize: 11,
    fontFamily: FONT.semibold,
    fontWeight: '600',
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  switchSmall: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
