import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, View } from 'react-native';

import {
  FormSwitchRow,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { AutoLogTutorialTopic } from '~/navigation/settingsStack';
import { triggerHaptic } from '~/services/haptics';
import {
  getNotificationListenerState,
  isNotificationCaptureSupported,
  type NotificationListenerState,
  openNotificationAccessSettings,
  readListenerStatus,
  rebindNotificationListener,
  unbindNotificationListener,
} from '~/services/paymentCapture';
import type { PaymentAlertSource } from '~/types';

import { isPayableAccount } from '../lib/binding';

interface PaymentAlertsSettingsScreenProps {
  onBack: () => void;
  onOpenSource: (source: PaymentAlertSource) => void;
  onOpenTutorial: (topic: AutoLogTutorialTopic) => void;
  onOpenSetup: (step?: 'apps') => void;
}
const IS_ANDROID = Platform.OS === 'android';
const IOS_HAS_NOTIFICATION_TRIGGER =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 27;
const QUIET_WARNING_MS = 2 * 24 * 60 * 60 * 1000;
function Divider() {
  return <View className="ml-4 h-px bg-border/40" />;
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border/30 bg-card">{children}</View>
  );
}
function LinkRow({
  label,
  detail,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      className="flex-row items-center gap-3 px-4 py-3"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
    >
      <View className="flex-1 gap-1">
        <Text>{label}</Text>
        {detail ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function TutorialCard({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="caption" tone="muted" className="px-1">
        {title}
      </Text>
      <Card>
        <Text variant="caption" tone="muted" className="px-4 py-3">
          {description}
        </Text>
        <Divider />
        <LinkRow
          label={I18n.t('settings.auto_log.tutorial_button')}
          accessibilityLabel={title}
          onPress={onPress}
        />
      </Card>
    </View>
  );
}

export function PaymentAlertsSettingsScreen({
  onBack,
  onOpenSource,
  onOpenTutorial,
  onOpenSetup,
}: PaymentAlertsSettingsScreenProps) {
  const { accounts } = useApp();
  const { paymentAlertPrefs: prefs, updatePaymentAlertPrefs: updatePrefs } = useApp();
  const bottomInset = useSettingsBottomNavInset();
  const [listener, setListener] = useState<NotificationListenerState | null>(null);
  const [status, setStatus] = useState(() => readListenerStatus());
  const refreshHealth = useCallback(() => {
    if (!isNotificationCaptureSupported()) return;
    void getNotificationListenerState().then(setListener);
    setStatus(readListenerStatus());
  }, []);
  useEffect(() => {
    refreshHealth();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshHealth();
    });
    return () => subscription.remove();
  }, [refreshHealth]);
  const sources = useMemo(
    () =>
      Object.values(prefs.sources)
        .filter((source) => source.channel === (IS_ANDROID ? 'android_notification' : 'ios_alert'))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [prefs.sources],
  );
  const toggleAlerts = (enabled: boolean) => {
    if (enabled && (!listener?.granted || sources.length === 0)) {
      onOpenSetup(listener?.granted ? 'apps' : undefined);
      return;
    }
    updatePrefs((previous) => ({ ...previous, alertsEnabled: enabled }));
    if (enabled) void rebindNotificationListener().then(refreshHealth);
    else void unbindNotificationListener();
  };
  const quiet =
    status.lastNotificationAt !== null && Date.now() - status.lastNotificationAt > QUIET_WARNING_MS;
  const health = !isNotificationCaptureSupported()
    ? I18n.t('payment_alerts.health_unsupported')
    : !prefs.alertsEnabled || listener === null
      ? null
      : !listener.granted
        ? I18n.t('payment_alerts.health_access_off')
        : !listener.connected || quiet
          ? I18n.t('payment_alerts.health_not_receiving')
          : null;
  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={bottomInset}>
        <View className="gap-6 px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-0"
            onBack={onBack}
            title={I18n.t('payment_alerts.title')}
          />
          <Text variant="caption" tone="muted">
            {I18n.t(IS_ANDROID ? 'payment_alerts.intro_android' : 'payment_alerts.intro_ios')}
          </Text>
          {IS_ANDROID ? (
            <Card>
              <View className="gap-3 p-4">
                <Text variant="caption" tone="muted">
                  {I18n.t('payment_alerts.master_hint')}
                </Text>
                <FormSwitchRow
                  label={I18n.t('payment_alerts.master_label')}
                  value={prefs.alertsEnabled}
                  onValueChange={toggleAlerts}
                />
              </View>
              {health ? (
                <>
                  <Divider />
                  <View className="gap-3 p-4">
                    <Text variant="caption" tone="muted">
                      {I18n.t('payment_alerts.section_status')}
                    </Text>
                    <Text variant="caption" tone="warning">
                      {health}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {I18n.t('payment_alerts.health_battery_hint')}
                    </Text>
                    <View className="flex-row gap-4">
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void openNotificationAccessSettings()}
                      >
                        <Text variant="caption" tone="primary">
                          {I18n.t('payment_alerts.access_open_settings')}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void rebindNotificationListener().then(refreshHealth)}
                      >
                        <Text variant="caption" tone="primary">
                          {I18n.t('payment_alerts.health_reconnect')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : null}
            </Card>
          ) : (
            <View className="gap-4">
              <TutorialCard
                title={I18n.t('payment_alerts.ios_notifications_title')}
                description={I18n.t(
                  IOS_HAS_NOTIFICATION_TRIGGER
                    ? 'payment_alerts.ios_notifications_hint'
                    : 'payment_alerts.ios_needs_27',
                )}
                onPress={() => onOpenTutorial('paymentAlertsIos')}
              />
            </View>
          )}
          {IS_ANDROID || sources.length > 0 ? (
            <View className="gap-2">
              <Text variant="caption" tone="muted" className="px-1">
                {I18n.t(
                  IS_ANDROID ? 'payment_alerts.section_apps' : 'payment_alerts.section_sources',
                )}
              </Text>
              <Card>
                {sources.map((source, index) => (
                  <View key={`${source.channel}:${source.sourceKey}`}>
                    {index > 0 ? <Divider /> : null}
                    <LinkRow
                      label={source.label}
                      detail={
                        source.enabled
                          ? (accounts.find(
                              (account) =>
                                account.id === source.accountId && isPayableAccount(account),
                            )?.name ?? I18n.t('transactions.editor.choose_account'))
                          : I18n.t('payment_alerts.source_off')
                      }
                      onPress={() => onOpenSource(source)}
                    />
                  </View>
                ))}
                {IS_ANDROID ? (
                  <>
                    {sources.length > 0 ? <Divider /> : null}
                    <LinkRow
                      label={I18n.t('payment_alerts.choose_apps')}
                      onPress={() => onOpenSetup(listener?.granted ? 'apps' : undefined)}
                    />
                  </>
                ) : null}
              </Card>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
