import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';

import { FlashBanner } from '~/components/feedback/FlashBanner';
import { ClayIcon } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ScanProgress } from '~/features/transactions/components/ScanStatusBanner';
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

/** How long the review banner stays before it tucks itself away. */
const REVIEW_AUTO_HIDE_MS = 9000;

/**
 * Home's flash banner for payment alerts waiting for review, stacked with the
 * receipt-scan banners. Review opens the review page. Its X ignores the
 * notifications still waiting, like Ignore All on the review page, and marks
 * auto-review's results seen. A swipe up, or the banner running out of time,
 * only puts it away until something new arrives or the app returns to the
 * foreground. With AI auto-review on it shows the batch in progress with the
 * scan banner's own progress row (and stays while it runs), then one line on
 * what AI did, so the results are in front of the user right after launch.
 */
export function NotificationReviewBanner() {
  const app = useApp();
  const { settings } = app;
  const live = useRef(app);
  live.current = app;
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
  // The banner's X plays the haptic.
  const dismiss = () => {
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
  // The Review button plays its own haptic; a tap on the banner adds one.
  const openPage = () => requestOpenPaymentAlerts({ screen: 'NotificationHistory' });
  const open = () => {
    void triggerHaptic('selection');
    openPage();
  };
  // Put away until something new arrives or the app comes back to the
  // foreground, without ignoring anything or marking AI's results seen.
  const putAway = () => setDismissed(new Set([...ids, ...aiIds]));
  const icon = <ClayIcon name="settings/notifications" size={30} flatSize={22} />;
  if (reviewing > 0) {
    const label = I18n.t(countKey('payment_alerts.ai_banner_reviewing', reviewing), {
      count: reviewing,
    });
    return (
      <FlashBanner
        testID="notification-review-banner"
        icon={icon}
        body={<ScanProgress label={label} />}
        onPress={open}
        accessibilityLabel={label}
      />
    );
  }
  const subtitle =
    done && ids.length > 0
      ? I18n.t(countKey('payment_alerts.ai_banner_needs_you', ids.length), { count: ids.length })
      : null;
  return (
    <FlashBanner
      testID="notification-review-banner"
      icon={icon}
      title={title}
      subtitle={subtitle}
      onPress={open}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      onClose={dismiss}
      closeLabel={I18n.t(ids.length > 0 ? 'payment_alerts.review_ignore_all' : 'common.close')}
      actions={[{ label: I18n.t('common.review'), onPress: openPage }]}
      onSwipeAway={putAway}
      autoHideMs={REVIEW_AUTO_HIDE_MS}
      onAutoHide={putAway}
    />
  );
}
