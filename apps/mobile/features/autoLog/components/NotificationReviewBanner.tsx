import { Bell, ChevronRight, Sparkles, X } from 'lucide-react-native';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  isUnseenAiResult,
  markNotificationAiResultsSeen,
  readNotificationScanHistory,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';
import { requestOpenPaymentAlerts } from '~/services/paymentAlertsNavigation';

import { countKey } from '../lib/presentation';
import { getNotificationAiStatus, subscribeNotificationAiStatus } from '../notificationAiReview';

/**
 * Inline home review action alongside receipt scans; dismissal never ignores
 * unfinished items. With AI auto-review on it shows the batch in progress, then
 * what AI did, so the results are in front of the user right after launch.
 */
export function NotificationReviewBanner() {
  const { settings } = useApp();
  const colors = useThemeColors();
  const [ids, setIds] = useState<string[]>([]);
  const [aiIds, setAiIds] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const aiStatus = useSyncExternalStore(subscribeNotificationAiStatus, getNotificationAiStatus);
  useEffect(() => {
    let active = true;
    setIds([]);
    setAiIds([]);
    setDismissed(null);
    const load = () => {
      void readNotificationScanHistory(settings.appUserId)
        .then((rows) => {
          if (!active) return;
          setIds(rows.filter((row) => row.result === 'pending').map((row) => row.id));
          setAiIds(rows.filter(isUnseenAiResult).map((row) => row.id));
        })
        .catch(() => undefined);
    };
    const stop = subscribeNotificationScanHistory(settings.appUserId, load);
    const state = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setDismissed(null);
        load();
      }
    });
    load();
    return () => {
      active = false;
      stop();
      state.remove();
    };
  }, [settings.appUserId]);
  const reviewing = aiStatus?.reviewing ?? 0;
  const signature = `${reviewing > 0}|${ids.join('|')}|${aiIds.join('|')}`;
  const visible = (reviewing > 0 || ids.length > 0 || aiIds.length > 0) && signature !== dismissed;
  if (!visible) return null;
  const ai = reviewing > 0 || aiIds.length > 0;
  const title =
    reviewing > 0
      ? I18n.t(countKey('payment_alerts.ai_banner_reviewing', reviewing), { count: reviewing })
      : aiIds.length > 0
        ? I18n.t(countKey('payment_alerts.ai_banner_done', aiIds.length), { count: aiIds.length })
        : I18n.t(
            ids.length === 1
              ? 'payment_alerts.review_banner_single'
              : 'payment_alerts.review_banner',
            { count: ids.length },
          );
  const hint =
    reviewing > 0
      ? null
      : aiIds.length > 0
        ? ids.length > 0
          ? I18n.t(countKey('payment_alerts.ai_banner_needs_you', ids.length), {
              count: ids.length,
            })
          : I18n.t('payment_alerts.ai_banner_hint')
        : I18n.t('payment_alerts.review_banner_hint');
  return (
    <View className="items-center">
      <Pressable
        accessibilityRole="button"
        testID="notification-review-banner"
        onPress={() => {
          void triggerHaptic('selection');
          requestOpenPaymentAlerts({ screen: 'NotificationHistory' });
        }}
        className="w-full max-w-[640px] flex-row items-center gap-3 rounded-2xl border border-border/50 bg-card p-3 shadow-float"
      >
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          {reviewing > 0 ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : ai ? (
            <Sparkles size={20} color={colors.primary} />
          ) : (
            <Bell size={20} color={colors.primary} />
          )}
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong">{title}</Text>
          {hint ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.primary} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.close')}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            void triggerHaptic('selection');
            setDismissed(signature);
            // Dismissed, AI's results move to Recent (where Undo stays).
            void markNotificationAiResultsSeen(settings.appUserId, aiIds).catch(() => undefined);
          }}
          className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}
