import { ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Pressable, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ScanProgress } from '~/features/transactions/components/ScanStatusBanner';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { resolveNotificationReviews } from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
  isUnseenAiResult,
  markNotificationAiResultsSeen,
  readNotificationScanHistory,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';
import { requestOpenPaymentAlerts } from '~/services/paymentAlertsNavigation';

import { countKey, isReviewBannerVisible } from '../lib/presentation';
import { getNotificationAiStatus, subscribeNotificationAiStatus } from '../notificationAiReview';

/**
 * Inline home review action, styled like the receipt-scan banner beside it.
 * Its X ignores the notifications still waiting, like Ignore All on the review
 * page, and marks auto-review's results seen. With AI auto-review on it shows the
 * batch in progress with the scan banner's own progress row, then one line on
 * what AI did, so the results are in front of the user right after launch.
 */
export function NotificationReviewBanner() {
  const app = useApp();
  const { settings } = app;
  const live = useRef(app);
  live.current = app;
  const colors = useThemeColors();
  const [ids, setIds] = useState<string[]>([]);
  const [aiIds, setAiIds] = useState<string[]>([]);
  // What X cleared; anything new (or a new review run) brings the banner back.
  const [dismissed, setDismissed] = useState<ReadonlySet<string> | null>(null);
  // History generation the ids were read under, so X never pairs them with a
  // history reset since; and whether X's ignore is still running.
  const generation = useRef(getNotificationScanHistoryGeneration(settings.appUserId));
  const ignoring = useRef(false);
  const aiStatus = useSyncExternalStore(subscribeNotificationAiStatus, getNotificationAiStatus);
  useEffect(() => {
    let active = true;
    setIds([]);
    setAiIds([]);
    setDismissed(null);
    const load = () => {
      const readGeneration = getNotificationScanHistoryGeneration(settings.appUserId);
      void readNotificationScanHistory(settings.appUserId)
        .then((rows) => {
          if (!active) return;
          generation.current = readGeneration;
          setIds(rows.filter((row) => row.result === 'pending').map((row) => row.id));
          setAiIds(rows.filter((row) => isUnseenAiResult(row)).map((row) => row.id));
        })
        .catch(() => undefined);
    };
    const stop = subscribeNotificationScanHistory(settings.appUserId, load);
    const state = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // An ignore still running would show its items again for a moment.
        if (!ignoring.current) setDismissed(null);
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
  if (!isReviewBannerVisible(reviewing, ids, aiIds, dismissed)) return null;
  const done = reviewing === 0 && aiIds.length > 0;
  const title = done
    ? I18n.t(countKey('payment_alerts.ai_banner_done', aiIds.length), { count: aiIds.length })
    : I18n.t(
        ids.length === 1 ? 'payment_alerts.review_banner_single' : 'payment_alerts.review_banner',
        { count: ids.length },
      );
  const dismiss = () => {
    void triggerHaptic('selection');
    const appUserId = settings.appUserId;
    setDismissed(new Set([...ids, ...aiIds]));
    // Seen, AI's results move to History (where Undo stays).
    void markNotificationAiResultsSeen(appUserId, aiIds).catch(() => undefined);
    if (ids.length === 0) return;
    ignoring.current = true;
    resolveNotificationReviews(ids, 'none', {
      appUserId,
      generation: generation.current,
      getCurrent: () => ({ ...live.current, appUserId: live.current.settings.appUserId }),
    })
      .catch(() => {
        // Ignore stops at a capture it cannot find: show what is left and say so.
        setDismissed(null);
        Alert.alert(
          I18n.t('payment_alerts.history_title'),
          I18n.t('payment_alerts.review_save_error'),
        );
      })
      .finally(() => {
        ignoring.current = false;
      });
  };
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
          {/* A nested Pressable so X does not open the page. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t(
              ids.length > 0 ? 'payment_alerts.review_ignore_all' : 'common.close',
            )}
            testID="notification-review-banner-dismiss"
            hitSlop={8}
            onPress={dismiss}
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
