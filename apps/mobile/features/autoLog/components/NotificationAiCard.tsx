import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import {
  Button,
  ClayIcon,
  InfoTooltipButton,
  PromptSheet,
  SegmentedToggle,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import {
  FREE_NOTIFICATION_AI_REVIEWS,
  isNotificationAiAvailable,
  type NotificationAiQuota,
  notificationAiRemaining,
} from '~/services/notificationAi';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import type { NotificationAiLogTypes, NotificationAiReviewPrefs } from '~/types';

import {
  getCachedNotificationAiQuota,
  isNotificationAiExhausted,
  loadNotificationAiQuota,
  refreshNotificationAiQuota,
  subscribeNotificationAiQuota,
} from '../notificationAiReview';

const NOTIFICATION_AI_PAYWALL_SOURCE = 'notification_ai';

/** The install's AI review allowance, refreshed from the Worker on mount and on upgrade. */
export function useNotificationAiQuota(refresh: boolean): NotificationAiQuota | null {
  const { settings } = useApp();
  const isPro = useIsPro();
  const appUserId = settings.appUserId;
  const quota = useSyncExternalStore(subscribeNotificationAiQuota, () =>
    getCachedNotificationAiQuota(appUserId),
  );
  // Only asks the Worker while auto-review is on or its settings are open:
  // with it off, the page never contacts the service.
  useEffect(() => {
    void loadNotificationAiQuota(appUserId).then(() =>
      refresh ? refreshNotificationAiQuota(appUserId) : null,
    );
  }, [appUserId, isPro, refresh]);
  return quota;
}

/** Usage line: "32 of 40 free left", or unlimited on Pro. */
function quotaLabel(quota: NotificationAiQuota | null, isPro: boolean): string {
  if (isPro || quota?.isPro) return I18n.t('payment_alerts.ai_quota_pro');
  const limit = quota?.limit ?? FREE_NOTIFICATION_AI_REVIEWS;
  return I18n.t('payment_alerts.ai_quota_free', {
    count: notificationAiRemaining(quota),
    limit,
  });
}

/**
 * Top of the review page: the AI auto-review switch, what it covers, and the
 * allowance. Tapping the card opens its settings; out of free reviews, the
 * switch is off and disabled next to Upgrade.
 */
export function NotificationAiCard() {
  const { paymentAlertPrefs, updatePaymentAlertPrefs } = useApp();
  const isPro = useIsPro();
  const colors = useThemeColors();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prefs = paymentAlertPrefs.aiReview;
  const quota = useNotificationAiQuota(prefs.enabled || settingsOpen);
  const exhausted = isNotificationAiExhausted(quota, isPro);
  const enabled = prefs.enabled && !exhausted;
  if (!isNotificationAiAvailable()) return null;

  const save = (next: NotificationAiReviewPrefs) => {
    updatePaymentAlertPrefs((previous) => ({ ...previous, aiReview: next }));
    void trackEvent(AnalyticsEvents.NOTIFICATION_AI_REVIEW_TOGGLED, {
      enabled: next.enabled,
      log_types: next.logTypes,
    });
  };
  const turnOn = () => {
    if (exhausted) {
      requestOpenPaywall(NOTIFICATION_AI_PAYWALL_SOURCE);
      return;
    }
    Alert.alert(
      I18n.t('payment_alerts.ai_consent_title'),
      I18n.t('payment_alerts.ai_consent_body'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('payment_alerts.ai_consent_confirm'),
          onPress: () => save({ ...prefs, enabled: true }),
        },
      ],
    );
  };

  // A slim line: the switch and what is left. Scope lives in the settings sheet.
  const subtitle = exhausted
    ? I18n.t('payment_alerts.ai_exhausted', { limit: quota?.limit ?? FREE_NOTIFICATION_AI_REVIEWS })
    : isPro || quota?.isPro
      ? I18n.t('payment_alerts.ai_quota_unlimited')
      : I18n.t('payment_alerts.ai_quota_left', { count: notificationAiRemaining(quota) });

  return (
    <View className="mx-auto w-full max-w-[640px] px-5 pb-1">
      <View className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-card py-3 pl-3 pr-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('payment_alerts.ai_settings')}
          accessibilityHint={subtitle}
          testID="notification-ai-settings"
          disabled={exhausted}
          onPress={() => {
            void triggerHaptic('selection');
            setSettingsOpen(true);
          }}
          className="flex-1 flex-row items-center gap-3"
        >
          <ClayIcon
            name="status/auto-review"
            size={40}
            flatSize={22}
            opacity={enabled || exhausted ? 1 : 0.85}
          />
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {I18n.t('payment_alerts.ai_title')}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
                {subtitle}
              </Text>
              <InfoTooltipButton
                iconSize={13}
                title={I18n.t('payment_alerts.ai_quota_info_title')}
                infoTooltip={I18n.t('payment_alerts.ai_quota_info', {
                  limit: quota && !quota.isPro ? quota.limit : FREE_NOTIFICATION_AI_REVIEWS,
                })}
              />
            </View>
          </View>
        </Pressable>
        {exhausted ? (
          <Button
            size="sm"
            className="h-9 rounded-full px-4"
            testID="notification-ai-upgrade"
            onPress={() => requestOpenPaywall(NOTIFICATION_AI_PAYWALL_SOURCE)}
          >
            <Text>{I18n.t('payment_alerts.ai_upgrade')}</Text>
          </Button>
        ) : (
          <Switch
            testID="notification-ai-switch"
            accessibilityLabel={I18n.t('payment_alerts.ai_title')}
            value={enabled}
            onValueChange={(next) => {
              void triggerHaptic('selection');
              if (next) turnOn();
              else save({ ...prefs, enabled: false });
            }}
            trackColor={{ false: `${colors.border}80`, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        )}
      </View>
      <NotificationAiSettingsSheet
        visible={settingsOpen}
        prefs={prefs}
        quota={quota}
        onDismiss={() => setSettingsOpen(false)}
        onChange={(next) =>
          updatePaymentAlertPrefs((previous) => ({ ...previous, aiReview: next }))
        }
      />
    </View>
  );
}

/**
 * Which types auto-review may log. Every linked account is covered: each
 * notification goes to the account its app or shortcut is linked to. Changes
 * save as they are made.
 */
function NotificationAiSettingsSheet({
  visible,
  prefs,
  quota,
  onDismiss,
  onChange,
}: {
  visible: boolean;
  prefs: NotificationAiReviewPrefs;
  quota: NotificationAiQuota | null;
  onDismiss: () => void;
  onChange: (next: NotificationAiReviewPrefs) => void;
}) {
  const isPro = useIsPro();
  const free = !isPro && !quota?.isPro;
  const limit = quota?.limit ?? FREE_NOTIFICATION_AI_REVIEWS;
  const left = notificationAiRemaining(quota);
  return (
    <PromptSheet visible={visible} onDismiss={onDismiss}>
      <View className="gap-5 p-5 pb-3">
        <View className="gap-1.5">
          <Text variant="subheading">{I18n.t('payment_alerts.ai_title')}</Text>
          <Text variant="body" tone="muted">
            {I18n.t('payment_alerts.ai_description')}
          </Text>
        </View>
        <View className="gap-2">
          <Text variant="caption" tone="muted" className="font-semibold">
            {I18n.t('payment_alerts.ai_log_label')}
          </Text>
          <SegmentedToggle<NotificationAiLogTypes>
            value={prefs.logTypes}
            onChange={(logTypes) => onChange({ ...prefs, logTypes })}
            options={(['both', 'expense', 'income'] as const).map((value) => ({
              value,
              label: I18n.t(`payment_alerts.ai_log_${value}`),
            }))}
          />
        </View>
        {free ? (
          <View className="gap-2">
            <Text variant="caption" tone="muted">
              {quotaLabel(quota, isPro)}
            </Text>
            <View className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${limit > 0 ? (left / limit) * 100 : 0}%` }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onDismiss();
                requestOpenPaywall(NOTIFICATION_AI_PAYWALL_SOURCE);
              }}
            >
              <Text variant="caption" className="font-semibold text-primary">
                {I18n.t('payment_alerts.ai_get_unlimited')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <View className="px-5 pb-5 pt-2">
        <Button onPress={onDismiss} testID="notification-ai-settings-done">
          <Text>{I18n.t('common.done')}</Text>
        </Button>
      </View>
    </PromptSheet>
  );
}
