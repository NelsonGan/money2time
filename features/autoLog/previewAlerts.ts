import { reportError } from '~/services/errorReporting';
import { emitTestAlertResult, type TestAlertResult } from '~/services/paymentAlertsBridge';
import { scanPaymentAlert } from '~/services/paymentAlertScan';

import { isPayableAccount } from './lib/binding';
import type { CaptureInput } from './lib/captureQueue';
import { TEST_ALERT_TIMEOUT_MS } from './lib/constants';
import {
  analyzeCapture,
  buildNotificationScanArgs,
  captureSkipReason,
  finalizeCapture,
} from './lib/pipeline';
import { buildPipelineContext } from './processAlerts';

type PreviewDeps = Parameters<typeof buildPipelineContext>[0] & { appUserId: string };

/** Setup previews never persist a transaction or retain a failed test for later inference. */
export async function previewTestAlerts(
  tests: readonly CaptureInput[],
  getCurrent: () => PreviewDeps,
  emit: (result: TestAlertResult) => void = emitTestAlertResult,
  now: Date = new Date(),
): Promise<CaptureInput[]> {
  for (const capture of tests) {
    const age = now.getTime() - new Date(capture.capturedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > TEST_ALERT_TIMEOUT_MS) continue;
    const result: TestAlertResult = {
      captureId: capture.id,
      capturedAt: capture.capturedAt,
      amount: null,
      currency: null,
      counterparty: null,
      accountId: null,
      categoryId: null,
      wouldLog: false,
    };
    try {
      let deps = getCurrent();
      let ctx = buildPipelineContext(deps);
      const testSource = Object.values(ctx.prefs.sources).find(
        (source) =>
          source.channel === 'android_notification' &&
          source.enabled &&
          ctx.accounts.some(
            (account) => account.id === source.accountId && isPayableAccount(account),
          ),
      );
      if (!testSource || !ctx.prefs.alertsEnabled) {
        emit(result);
        continue;
      }
      const input = { ...capture, sourceKey: testSource.sourceKey };
      const args = buildNotificationScanArgs(input, ctx, deps.appUserId, testSource.accountId);
      const scanned = await scanPaymentAlert(args);
      deps = getCurrent();
      ctx = buildPipelineContext(deps);
      const analysis = analyzeCapture(input, ctx, scanned);
      const outcome = finalizeCapture(analysis, ctx, {
        duplicate: { kind: 'none' },
        autoLogsRemaining: null,
      });
      result.amount = analysis.parse.amount;
      result.currency = analysis.parse.currency;
      result.counterparty = analysis.parse.counterparty;
      result.accountId = outcome.resolution.accountId;
      result.categoryId = outcome.resolution.categoryId;
      result.wouldLog =
        outcome.decision.action === 'log' &&
        captureSkipReason(analysis, ctx, null) === null &&
        buildNotificationScanArgs(input, ctx, deps.appUserId, analysis.binding.accountId)
          .currency === args.currency;
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_test' });
    }
    emit(result);
  }
  return [...tests];
}
