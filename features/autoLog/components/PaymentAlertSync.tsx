import { useCallback, useEffect, useRef } from 'react';
import { AppState, InteractionManager } from 'react-native';

import { useApp, useTransactions } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { reportError } from '~/services/errorReporting';
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
import { analyzeCapture, finalizeCapture } from '../lib/pipeline';
import {
  androidCapturePackages,
  findAlertSource,
  newAlertSource,
  withAlertSource,
} from '../lib/prefs';
import { buildPipelineContext, processAlertCaptures } from '../processAlerts';

/**
 * Turns queued payment alerts into transactions. Mounted once,
 * outside the tabs (it needs live transactions for de-duplication), next to
 * AutoLogSync. Runs on mount, on every foreground, whenever Android's listener
 * writes a capture while the app is open, and on an explicit request (a
 * setup screen's test alert).
 *
 * It also keeps the Android listener's config in step with the watched apps,
 * and asks Android to rebind the listener when it was dropped.
 */
export function PaymentAlertSync() {
  const { accounts, categories, settings, quickEntryPrefs, createTransaction } = useApp();
  const { transactions } = useTransactions();
  const isPro = useIsPro();
  const { paymentAlertPrefs: prefs, updatePaymentAlertPrefs: updatePrefs } = useApp();

  const stateRef = useRef({
    accounts,
    categories,
    settings,
    quickEntryPrefs,
    createTransaction,
    isPro,
    prefs,
    updatePrefs,
    transactions,
  });
  stateRef.current = {
    accounts,
    categories,
    settings,
    quickEntryPrefs,
    createTransaction,
    isPro,
    prefs,
    updatePrefs,
    transactions,
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
        const queued = await readQueuedCaptures();
        if (queued.length === 0) break;
        const current = stateRef.current;
        const tests = queued.filter((capture) => capture.isTest);
        if (tests.length > 0) {
          previewTestAlerts(tests, {
            ...current,
            reportingCurrency: current.settings.currencyCode,
          });
          await clearQueuedCaptures(tests);
        }
        const captures = queued.filter((capture) => !capture.isTest);
        if (captures.length === 0) continue;
        // An iOS automation is its own opt-in: the first alert it sends
        // registers its "From" as a source, so the user can manage it here.
        const effectivePrefs = registerIosSources(current.prefs, captures);
        if (effectivePrefs !== current.prefs) current.updatePrefs(effectivePrefs);
        const summary = await processAlertCaptures(captures, {
          ...current,
          prefs: effectivePrefs,
          reportingCurrency: current.settings.currencyCode,
        });
        // Only remove alerts durably handled by the pipeline.
        await clearQueuedCaptures(
          captures.filter((capture) => summary.captureIds.includes(capture.id)),
        );
        if (summary.captured > 0) {
          void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_DRAINED, {
            captured: summary.captured,
            logged: summary.logged,
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

function registerIosSources(
  prefs: Parameters<typeof withAlertSource>[0],
  captures: readonly CaptureInput[],
) {
  let next = prefs;
  for (const capture of captures) {
    if (capture.channel !== 'ios_alert') continue;
    if (findAlertSource(next, capture.channel, capture.sourceKey)) continue;
    next = withAlertSource(
      next,
      newAlertSource(
        {
          channel: 'ios_alert',
          sourceKey: capture.sourceKey,
          label: capture.sourceLabel ?? capture.sourceKey,
          accountId: capture.presetAccountId,
        },
        new Date().toISOString(),
      ),
    );
  }
  return next;
}

/** Run the setup screen's test alert through the pipeline without storing it. */
function previewTestAlerts(
  tests: readonly CaptureInput[],
  deps: Parameters<typeof buildPipelineContext>[0],
) {
  const ctx = buildPipelineContext(deps);
  for (const capture of tests) {
    const testSource = Object.values(ctx.prefs.sources).find(
      (source) => source.channel === 'android_notification' && source.enabled && source.accountId,
    );
    const analysis = analyzeCapture(
      { ...capture, sourceKey: testSource?.sourceKey ?? capture.sourceKey },
      ctx,
    );
    const outcome = finalizeCapture(analysis, ctx, {
      duplicate: { kind: 'none', supersedesCaptureId: null },
      autoLogsRemaining: null,
    });
    emitTestAlertResult({
      amount: analysis.parse.amount,
      currency: analysis.parse.currency,
      counterparty: analysis.parse.counterparty,
      accountId: outcome.resolution.accountId,
      categoryId: outcome.resolution.categoryId,
      wouldLog: outcome.decision.action === 'log',
    });
  }
}
