import { Check, Sparkles } from 'lucide-react-native';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, ScrollView, Switch, useWindowDimensions, View } from 'react-native';

import {
  AccountLogo,
  Button,
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
import type { Account, NotificationAiLogTypes, NotificationAiReviewPrefs } from '~/types';

import { isPayableAccount } from '../lib/binding';
import {
  getCachedNotificationAiQuota,
  isNotificationAiExhausted,
  loadNotificationAiQuota,
  refreshNotificationAiQuota,
  subscribeNotificationAiQuota,
} from '../notificationAiReview';

export const NOTIFICATION_AI_PAYWALL_SOURCE = 'notification_ai';

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
  const { accounts, paymentAlertPrefs, updatePaymentAlertPrefs } = useApp();
  const isPro = useIsPro();
  const colors = useThemeColors();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prefs = paymentAlertPrefs.aiReview;
  const quota = useNotificationAiQuota(prefs.enabled || settingsOpen);
  const exhausted = isNotificationAiExhausted(quota, isPro);
  const enabled = prefs.enabled && !exhausted;
  const payable = accounts.filter(isPayableAccount);
  if (!isNotificationAiAvailable()) return null;

  const save = (next: NotificationAiReviewPrefs) => {
    updatePaymentAlertPrefs((previous) => ({ ...previous, aiReview: next }));
    void trackEvent(AnalyticsEvents.NOTIFICATION_AI_REVIEW_TOGGLED, {
      enabled: next.enabled,
      log_types: next.logTypes,
      account_scope: next.accountIds === null ? 'all' : 'some',
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
    <View className="mx-auto w-full max-w-[640px] px-5 pb-2">
      <View className="min-h-12 flex-row items-center gap-3">
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
          className="flex-1 flex-row flex-wrap items-center gap-x-2"
        >
          <Sparkles size={17} color={enabled ? colors.primary : colors.textMuted} />
          <Text variant="bodyStrong">{I18n.t('payment_alerts.ai_title')}</Text>
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
          <InfoTooltipButton
            iconSize={14}
            title={I18n.t('payment_alerts.ai_quota_info_title')}
            infoTooltip={I18n.t('payment_alerts.ai_quota_info', {
              limit: quota && !quota.isPro ? quota.limit : FREE_NOTIFICATION_AI_REVIEWS,
            })}
          />
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
            trackColor={{ true: colors.primary }}
          />
        )}
      </View>
      <NotificationAiSettingsSheet
        visible={settingsOpen}
        prefs={prefs}
        accounts={payable}
        quota={quota}
        onDismiss={() => setSettingsOpen(false)}
        onChange={(next) =>
          updatePaymentAlertPrefs((previous) => ({ ...previous, aiReview: next }))
        }
      />
    </View>
  );
}

/** What AI may log and from which accounts. Changes save as they are made. */
function NotificationAiSettingsSheet({
  visible,
  prefs,
  accounts,
  quota,
  onDismiss,
  onChange,
}: {
  visible: boolean;
  prefs: NotificationAiReviewPrefs;
  accounts: readonly Account[];
  quota: NotificationAiQuota | null;
  onDismiss: () => void;
  onChange: (next: NotificationAiReviewPrefs) => void;
}) {
  const isPro = useIsPro();
  const { height } = useWindowDimensions();
  const all = prefs.accountIds === null;
  const selected = new Set(prefs.accountIds ?? accounts.map((account) => account.id));
  const toggleAccount = (id: string) => {
    void triggerHaptic('selection');
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Keep at least one of this ledger's accounts. Only the All row means
    // "every account" (other ledgers' and future ones too).
    if (!accounts.some((account) => next.has(account.id))) return;
    onChange({ ...prefs, accountIds: [...next] });
  };
  const free = !isPro && !quota?.isPro;
  const limit = quota?.limit ?? FREE_NOTIFICATION_AI_REVIEWS;
  const left = notificationAiRemaining(quota);
  return (
    <PromptSheet visible={visible} onDismiss={onDismiss}>
      {/* Long account lists scroll; Done stays in view below them. */}
      <ScrollView style={{ maxHeight: height * 0.62 }} contentContainerClassName="gap-5 p-5 pb-3">
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
        <View className="gap-2">
          <Text variant="caption" tone="muted" className="font-semibold">
            {I18n.t('payment_alerts.ai_accounts_label')}
          </Text>
          <View className="rounded-2xl border border-border/40 bg-card">
            <AccountRow
              label={I18n.t('payment_alerts.ai_all_accounts')}
              checked={all}
              onPress={() => {
                void triggerHaptic('selection');
                onChange({ ...prefs, accountIds: null });
              }}
            />
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                label={account.name}
                account={account}
                checked={selected.has(account.id)}
                onPress={() => toggleAccount(account.id)}
              />
            ))}
          </View>
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
      </ScrollView>
      <View className="px-5 pb-5 pt-2">
        <Button onPress={onDismiss} testID="notification-ai-settings-done">
          <Text>{I18n.t('common.done')}</Text>
        </Button>
      </View>
    </PromptSheet>
  );
}

function AccountRow({
  label,
  account,
  checked,
  onPress,
}: {
  label: string;
  account?: Account;
  checked: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 border-b border-border/30 px-4 py-2.5 last:border-b-0"
    >
      {account ? <AccountLogo logoId={account.logoId} type={account.type} size={26} /> : null}
      <Text variant="body" numberOfLines={1} className="flex-1">
        {label}
      </Text>
      <View
        className={`h-6 w-6 items-center justify-center rounded-md border ${checked ? 'border-primary bg-primary' : 'border-border'}`}
      >
        {checked ? <Check size={15} color={colors.background} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
