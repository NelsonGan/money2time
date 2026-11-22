import { X } from 'lucide-react-native';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Pressable, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ActivityPill, ScanProgress } from '~/features/transactions/components/ScanStatusBanner';
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

export interface NotificationReviewState {
  /** Whether there is anything to show: notifications to review, or AI's results. */
  visible: boolean;
  /** Notifications AI auto-review is working through right now. */
  reviewing: number;
  /** How many are waiting for the user. */
  pendingCount: number;
  title: string;
  subtitle: string | null;
  /** Ignore what is waiting (like Ignore All) and mark AI's results seen. */
  ignoreAll: () => void;
  /** Mark AI's results seen, which moves them to History. */
  markResultsSeen: () => void;
  open: () => void;
}

/**
 * Payment alerts waiting for review, for Home's activity circle and its sheet.
 * Reads the review history on launch, on every return to the foreground and on
 * every live capture. With AI auto-review on it reports the batch in progress,
 * then one line on what AI did, so the results are in front of the user right
 * after launch.
 */
export function useNotificationReviewState(): NotificationReviewState {
  const app = useApp();
  const { settings } = app;
  const live = useRef(app);
  live.current = app;
  const [ids, setIds] = useState<string[]>([]);
  const [aiIds, setAiIds] = useState<string[]>([]);
  // What Ignore All cleared; anything new (or a new review run) brings it back.
  const [dismissed, setDismissed] = useState<ReadonlySet<string> | null>(null);
  // History generation the ids were read under, so Ignore All never pairs them
  // with a history reset since; and whether its ignore is still running.
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
  const visible = isReviewBannerVisible(reviewing, ids, aiIds, dismissed);
  const shownIds = dismissed ? ids.filter((id) => !dismissed.has(id)) : ids;
  const shownAiIds = dismissed ? aiIds.filter((id) => !dismissed.has(id)) : aiIds;
  const done = reviewing === 0 && shownAiIds.length > 0;
  const title =
    reviewing > 0
      ? I18n.t(countKey('payment_alerts.ai_banner_reviewing', reviewing), { count: reviewing })
      : done
        ? I18n.t(countKey('payment_alerts.ai_banner_done', shownAiIds.length), {
            count: shownAiIds.length,
          })
        : I18n.t(
            shownIds.length === 1
              ? 'payment_alerts.review_banner_single'
              : 'payment_alerts.review_banner',
            { count: shownIds.length },
          );
  const subtitle =
    done && shownIds.length > 0
      ? I18n.t(countKey('payment_alerts.ai_banner_needs_you', shownIds.length), {
          count: shownIds.length,
        })
      : null;

  const markResultsSeen = () => {
    if (aiIds.length === 0) return;
    // Seen, AI's results move to History (where Undo stays).
    setDismissed((previous) => new Set([...(previous ?? []), ...aiIds]));
    void markNotificationAiResultsSeen(settings.appUserId, aiIds).catch(() => undefined);
  };
  const ignoreAll = () => {
    const appUserId = settings.appUserId;
    setDismissed(new Set([...ids, ...aiIds]));
    void markNotificationAiResultsSeen(appUserId, aiIds).catch(() => undefined);
    if (ids.length === 0) return;
    ignoring.current = true;
    resolveNotificationReviews(ids, 'none', {
      appUserId,
      generation: generation.current,
      getCurrent: () => ({ ...live.current, appUserId: live.current.settings.appUserId }),
    })
      .catch(() => {
        // A storage failure stops the ignore: show what is left and say so.
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
  const open = () => requestOpenPaymentAlerts({ screen: 'NotificationHistory' });

  return {
    visible,
    reviewing,
    pendingCount: shownIds.length,
    title,
    subtitle,
    ignoreAll,
    markResultsSeen,
    open,
  };
}

/**
 * The payment-alert row in Home's activity sheet, styled like the receipt-scan
 * rows beside it. Review opens the review page. Its X ignores the
 * notifications still waiting, like Ignore All on the review page, and marks
 * auto-review's results seen. While AI auto-review runs it shows the scan
 * row's own progress line.
 */
export function NotificationReviewCard({
  review,
  onOpen,
}: {
  review: NotificationReviewState;
  /** Runs before the review page opens, e.g. to close the sheet. */
  onOpen?: () => void;
}) {
  const colors = useThemeColors();
  if (!review.visible) return null;
  const open = () => {
    void triggerHaptic('selection');
    onOpen?.();
    review.open();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[review.title, review.subtitle].filter(Boolean).join(', ')}
      testID="notification-review-banner"
      onPress={open}
      // The row reads as one button to screen readers, so its X (Ignore All)
      // is offered as an action on it.
      accessibilityActions={
        review.reviewing > 0
          ? undefined
          : [
              {
                name: 'ignoreAll',
                label: I18n.t(
                  review.pendingCount > 0 ? 'payment_alerts.review_ignore_all' : 'common.close',
                ),
              },
            ]
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'ignoreAll') review.ignoreAll();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      className="flex-row items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5 shadow-soft"
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl">
        <ClayIcon name="settings/notifications" size={32} flatSize={22} />
      </View>
      {review.reviewing > 0 ? (
        <ScanProgress label={review.title} />
      ) : (
        <>
          <View className="min-w-0 flex-1">
            <Text variant="body" className="font-semibold text-foreground" numberOfLines={2}>
              {review.title}
            </Text>
            {review.subtitle ? (
              <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
                {review.subtitle}
              </Text>
            ) : null}
          </View>
          {/* Nested Pressables so neither opens the page twice. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t(
              review.pendingCount > 0 ? 'payment_alerts.review_ignore_all' : 'common.close',
            )}
            testID="notification-review-banner-dismiss"
            hitSlop={8}
            onPress={() => {
              void triggerHaptic('selection');
              review.ignoreAll();
            }}
            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60"
          >
            <X size={15} color={colors.textMuted} />
          </Pressable>
          <ActivityPill label={I18n.t('common.review')} onPress={open} />
        </>
      )}
    </Pressable>
  );
}
