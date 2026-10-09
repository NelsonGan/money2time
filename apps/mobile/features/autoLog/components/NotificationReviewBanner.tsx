import { Bell, ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  readNotificationScanHistory,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';
import { requestOpenPaymentAlerts } from '~/services/paymentAlertsNavigation';

/** Inline home review action alongside receipt scans; dismissal never ignores unfinished items. */
export function NotificationReviewBanner() {
  const { settings } = useApp();
  const colors = useThemeColors();
  const [ids, setIds] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setIds([]);
    setDismissed(null);
    const load = () => {
      void readNotificationScanHistory(settings.appUserId)
        .then((rows) => {
          if (active) setIds(rows.filter((row) => row.result === 'pending').map((row) => row.id));
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
  const signature = ids.join('|');
  const visible = ids.length > 0 && signature !== dismissed;
  if (!visible) return null;
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
          <Bell size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong">
            {I18n.t(
              ids.length === 1
                ? 'payment_alerts.review_banner_single'
                : 'payment_alerts.review_banner',
              { count: ids.length },
            )}
          </Text>
          <Text variant="caption" tone="muted">
            {I18n.t('payment_alerts.review_banner_hint')}
          </Text>
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
          }}
          className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}
