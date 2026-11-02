import { ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Pressable, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ScanProgress } from '~/features/transactions/components/ScanStatusBanner';
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
 * Inline home review action, styled like the receipt-scan banner beside it;
 * dismissal never ignores unfinished items. With AI auto-review on it shows the
 * batch in progress with the scan banner's own progress row, then one line on
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
          setAiIds(rows.filter((row) => isUnseenAiResult(row)).map((row) => row.id));
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
  const done = reviewing === 0 && aiIds.length > 0;
  const title = done
    ? I18n.t(countKey('payment_alerts.ai_banner_done', aiIds.length), { count: aiIds.length })
    : I18n.t(
        ids.length === 1 ? 'payment_alerts.review_banner_single' : 'payment_alerts.review_banner',
        { count: ids.length },
      );
  const open = () => {
    void triggerHaptic('selection');
    requestOpenPaymentAlerts({ screen: 'NotificationHistory' });
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        reviewing > 0
          ? I18n.t(countKey('payment_alerts.ai_banner_reviewing', reviewing), { count: reviewing })
          : title
      }
      testID="notification-review-banner"
      onPress={open}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      className="flex-row items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5 shadow-soft"
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl">
        <ClayIcon name="settings/notifications" size={32} flatSize={22} />
      </View>
      {reviewing > 0 ? (
        <ScanProgress
          label={I18n.t(countKey('payment_alerts.ai_banner_reviewing', reviewing), {
            count: reviewing,
          })}
        />
      ) : (
        <>
          <View className="flex-1">
            <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
              {title}
            </Text>
            {done && ids.length > 0 ? (
              <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
                {I18n.t(countKey('payment_alerts.ai_banner_needs_you', ids.length), {
                  count: ids.length,
                })}
              </Text>
            ) : null}
          </View>
          {/* A nested Pressable so dismissing does not open the page. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            hitSlop={8}
            onPress={() => {
              void triggerHaptic('selection');
              setDismissed(signature);
              // Dismissed, AI's results move to Recent (where Undo stays).
              void markNotificationAiResultsSeen(settings.appUserId, aiIds).catch(() => undefined);
            }}
            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60"
          >
            <X size={15} color={colors.textMuted} />
          </Pressable>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <ChevronRight size={16} color={colors.primary} />
          </View>
        </>
      )}
    </Pressable>
  );
}
