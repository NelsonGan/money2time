import { useCallback, useEffect, useRef } from 'react';
import { AppState, InteractionManager } from 'react-native';

import { useApp } from '~/context/AppContext';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { reportError } from '~/services/errorReporting';
import { getNotificationScanHistoryGeneration } from '~/services/notificationScanHistory';
import { emitTestAlertResult, subscribePaymentAlertDrain } from '~/services/paymentAlertsBridge';
import {
  clearQueuedCaptures,
  getNotificationListenerState,
  isNotificationCaptureSupported,
  isPaymentAlertCaptureSupported,
  readQueuedCaptures,
  rebindNotificationListener,
  subscribeCaptureQueued,
  writeListenerConfig,
} from '~/services/paymentCapture';

import type { CaptureInput } from '../lib/captureQueue';
import { androidCapturePackages } from '../lib/prefs';
import {
  type AlertProcessingDeps,
  analyzeNotificationCapture,
  buildPipelineContext,
  processAlertCaptures,
} from '../processAlerts';

/**
 * Queues notifications for explicit review with local amount candidates. Mounted once,
 * outside the tabs so capture runs regardless of the visible screen, next to
 * AutoLogSync. Runs on mount, on every foreground, whenever Android's listener
 * writes a capture while the app is open, and on an explicit request (a
 * setup screen's test alert).
 *
 * It also keeps the Android listener's config in step with the watched apps,
 * and asks Android to rebind the listener when it was dropped.
 */
export function PaymentAlertSync() {
  const { accounts, categories, settings, quickEntryPrefs } = useApp();
  const { paymentAlertPrefs: prefs } = useApp();

  const stateRef = useRef({
    accounts,
    categories,
    settings,
    quickEntryPrefs,
    prefs,
  });
  stateRef.current = {
    accounts,
    categories,
    settings,
    quickEntryPrefs,
    prefs,
  };
  const drainingRef = useRef(false);
  const rerunRef = useRef(false);

  // The listener reads this file; the packages are the only alert content filter.
  useEffect(() => {
    if (!isNotificationCaptureSupported()) return;
    writeListenerConfig({
      enabled: prefs.alertsEnabled,
      packages: androidCapturePackages(prefs),
      // `adb shell cmd notification post` alerts, for development only.
      allowShell: __DEV__ && prefs.alertsEnabled,
      // Turned off after being set up (apps chosen, master switch off), as
      // opposed to not set up yet, when setup still wants the recent apps.
      optedOut:
        !prefs.alertsEnabled &&
        Object.values(prefs.sources).some((source) => source.channel === 'android_notification'),
    });
  }, [prefs]);

  const drain = useCallback(async () => {
    if (!isPaymentAlertCaptureSupported()) return;
    if (drainingRef.current) {
      rerunRef.current = true;
      return;
    }
    drainingRef.current = true;
    try {
      do {
        rerunRef.current = false;
        const appUserId = stateRef.current.settings.appUserId;
        const scanGeneration = getNotificationScanHistoryGeneration(appUserId);
        const isCurrent = () =>
          stateRef.current.settings.appUserId === appUserId &&
          getNotificationScanHistoryGeneration(appUserId) === scanGeneration;
        const queued = await readQueuedCaptures();
        if (!isCurrent()) break;
        if (queued.length === 0) break;
        const current = stateRef.current;
        const tests = queued.filter((capture) => capture.isTest);
        if (tests.length > 0) {
          await previewTestAlerts(tests, {
            ...current,
            scanGeneration,
            reportingCurrency: current.settings.currencyCode,
            appUserId,
            getCurrent: () => ({
              ...stateRef.current,
              reportingCurrency: stateRef.current.settings.currencyCode,
              appUserId: stateRef.current.settings.appUserId,
            }),
          });
          if (!isCurrent()) break;
          await clearQueuedCaptures(tests);
        }
        if (!isCurrent()) break;
        const captures = queued.filter((capture) => !capture.isTest);
        if (captures.length === 0) continue;
        const summary = await processAlertCaptures(captures, {
          ...current,
          scanGeneration,
          reportingCurrency: current.settings.currencyCode,
          appUserId,
          getCurrent: () => ({
            ...stateRef.current,
            reportingCurrency: stateRef.current.settings.currencyCode,
            appUserId: stateRef.current.settings.appUserId,
          }),
        });
        // Only remove alerts durably handled by the pipeline.
        await clearQueuedCaptures(
          captures.filter((capture) => summary.captureIds.includes(capture.id)),
        );
        if (summary.captured > 0) {
          void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_DRAINED, {
            captured: summary.captured,
            logged: summary.logged,
            pending: summary.pending,
            ignored: summary.ignored,
            duplicates: summary.duplicates,
            account_certain: summary.accountCertain,
            channel: captures[0]?.channel ?? 'unknown',
          });
        }
      } while (rerunRef.current);
      paymentAlertCapturesRepository.sweep();
    } catch (error) {
      // Whatever was not cleared stays queued for the next foreground.
      reportError(error, { scope: 'payment_alerts_drain' });
    } finally {
      drainingRef.current = false;
    }
  }, []);
  // Source/account changes can make previously queued captures processable.
  useEffect(() => {
    void drain();
  }, [drain, prefs]);

  const drainRef = useRef(drain);
  drainRef.current = drain;
  const alertsEnabledRef = useRef(prefs.alertsEnabled);
  alertsEnabledRef.current = prefs.alertsEnabled;

  useEffect(() => {
    if (!isPaymentAlertCaptureSupported()) return undefined;
    // Off the startup path: the first screen needs the JS thread more.
    const handle = InteractionManager.runAfterInteractions(() => void drainRef.current());
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void drainRef.current();
      void repairListener(alertsEnabledRef.current);
    });
    const unsubscribeQueued = subscribeCaptureQueued(() => void drainRef.current());
    const unsubscribeRequests = subscribePaymentAlertDrain(() => void drainRef.current());
    return () => {
      handle.cancel();
      appState.remove();
      unsubscribeQueued();
      unsubscribeRequests();
    };
  }, []);

  return null;
}

/**
 * OEM battery managers and app updates sometimes leave a granted listener
 * unbound. Asking Android to rebind is cheap and harmless when it is fine.
 */
async function repairListener(alertsEnabled: boolean) {
  if (!alertsEnabled || !isNotificationCaptureSupported()) return;
  const state = await getNotificationListenerState();
  if (state.granted && !state.connected) await rebindNotificationListener();
}

/** Run the setup screen's test alert through the pipeline without storing it. */
async function previewTestAlerts(tests: readonly CaptureInput[], deps: AlertProcessingDeps) {
  for (const capture of tests) {
    const ctx = buildPipelineContext(deps.getCurrent?.() ?? deps);
    const testSource = Object.values(ctx.prefs.sources).find(
      (source) => source.channel === 'android_notification' && source.enabled && source.accountId,
    );
    try {
      const analysis = await analyzeNotificationCapture(
        { ...capture, sourceKey: testSource?.sourceKey ?? capture.sourceKey },
        deps,
      );
      emitTestAlertResult({
        capturedAt: capture.capturedAt,
        amount: analysis.parse.amount,
        currency: analysis.parse.currency,
        counterparty: analysis.parse.counterparty,
        accountId: analysis.binding.accountId,
        categoryId: null,
        wouldLog: analysis.parse.amount !== null && analysis.binding.accountId !== null,
      });
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_test_amount' });
      emitTestAlertResult({
        capturedAt: capture.capturedAt,
        amount: null,
        currency: null,
        counterparty: null,
        accountId: null,
        categoryId: null,
        wouldLog: false,
        scanFailed: true,
      });
    }
  }
}
