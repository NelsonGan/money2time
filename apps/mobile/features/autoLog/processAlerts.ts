// Capture notifications locally for explicit user review. No inference or transaction write happens here.
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { reportError } from '~/services/errorReporting';
import {
  getNotificationScanHistoryGeneration,
  recordNotificationScan,
} from '~/services/notificationScanHistory';
import type { Account, Category, PaymentAlertPrefs, QuickEntryPrefs } from '~/types';
import { extractNotificationAmounts } from '~/utils/notificationAmounts';

import type { CaptureInput } from './lib/captureQueue';
import { NOTIFICATION_PARSER_VERSION, notificationParse } from './lib/notification';
import { analyzeCapture, type CaptureAnalysis, type PipelineContext } from './lib/pipeline';
import { MAX_ALERT_TEXT_LENGTH, normalizeAlertText } from './lib/text';

export interface AlertProcessingDeps {
  appUserId: string;
  /** Re-read live preferences/accounts during local storage work. */
  getCurrent?: () => AlertProcessingDeps;
  /** Reset generation when reading the native queue began. */
  scanGeneration?: number;
  accounts: readonly Account[];
  categories: readonly Category[];
  prefs: PaymentAlertPrefs;
  reportingCurrency: string;
  quickEntryPrefs: QuickEntryPrefs;
}

export interface AlertProcessingSummary {
  captured: number;
  pending: number;
  logged: number;
  ignored: number;
  duplicates: number;
  accountCertain: number;
  /** Ids of the captures written, in order. */
  captureIds: string[];
}

export function buildPipelineContext(deps: AlertProcessingDeps): PipelineContext {
  return {
    accounts: deps.accounts,
    categories: deps.categories,
    prefs: deps.prefs,
    reportingCurrency: deps.reportingCurrency,
    defaultExpenseCategoryId: deps.quickEntryPrefs.defaultExpenseCategoryId,
    defaultIncomeCategoryId: deps.quickEntryPrefs.defaultIncomeCategoryId,
  };
}

/** Setup preview only: read money locally, with no income/expense classification. */
export async function analyzeNotificationCapture(
  capture: CaptureInput,
  deps: AlertProcessingDeps,
): Promise<CaptureAnalysis> {
  const current = deps.getCurrent?.() ?? deps;
  const ctx = buildPipelineContext(current);
  const initial = analyzeCapture(capture, ctx);
  const currency =
    current.accounts.find((account) => account.id === initial.binding.accountId)?.currency ??
    current.reportingCurrency;
  const text = normalizeAlertText([
    capture.isTest ? null : capture.title,
    capture.subtitle,
    capture.body,
    ...capture.extra,
  ]).text;
  return analyzeCapture(capture, ctx, notificationParse(text, currency));
}

/** Acknowledge only notifications persisted for review or disabled sources. */
export async function processAlertCaptures(
  captures: readonly CaptureInput[],
  deps: AlertProcessingDeps,
): Promise<AlertProcessingSummary> {
  const summary: AlertProcessingSummary = {
    captured: 0,
    pending: 0,
    logged: 0,
    ignored: 0,
    duplicates: 0,
    accountCertain: 0,
    captureIds: [],
  };
  const appUserId = deps.appUserId;
  const generation = deps.scanGeneration ?? getNotificationScanHistoryGeneration(appUserId);
  const isCurrent = () =>
    (deps.getCurrent?.() ?? deps).appUserId === appUserId &&
    getNotificationScanHistoryGeneration(appUserId) === generation;
  for (const capture of captures) {
    if (!isCurrent()) break;
    if (capture.isTest) continue;
    try {
      const current = deps.getCurrent?.() ?? deps;
      const initial = analyzeCapture(capture, buildPipelineContext(current));
      const stored = paymentAlertCapturesRepository.getById(capture.id);
      if (stored && stored.status !== 'failed') {
        summary.captureIds.push(capture.id);
        continue;
      }
      const disabled =
        capture.channel === 'android_notification' &&
        (!current.prefs.alertsEnabled || !initial.source?.enabled);
      if (!disabled) {
        const text = normalizeAlertText([
          capture.title,
          capture.subtitle,
          capture.body,
          ...capture.extra,
        ]).text;
        const currency =
          current.accounts.find((account) => account.id === initial.binding.accountId)?.currency ??
          current.reportingCurrency;
        // Truncated notifications remain reviewable; they are never automatically classified.
        const amounts = extractNotificationAmounts(text.slice(0, MAX_ALERT_TEXT_LENGTH), currency);
        await recordNotificationScan(
          appUserId,
          {
            id: capture.id,
            capturedAt: capture.capturedAt,
            sourceLabel: capture.sourceLabel,
            text,
            result: 'pending',
            accountId: initial.binding.accountId,
            categoryId: capture.presetCategoryId,
            channel: capture.channel,
            amounts,
            selectedAmount: amounts.length === 1 ? amounts[0] : null,
          },
          generation,
        );
        if (!isCurrent()) break;
        // Android sources can be switched off during storage I/O. The already
        // captured item remains reviewable; future captures honor the switch.
      }
      const status = disabled ? 'ignored' : 'pending';
      const reason = disabled ? 'source_disabled' : 'mode_review';
      const row = {
        id: capture.id,
        channel: capture.channel,
        sourceKey: capture.sourceKey,
        sourceLabel: capture.sourceLabel,
        capturedAt: capture.capturedAt,
        nativeKey: capture.nativeKey,
        title: null,
        body: null,
        status,
        reason,
        resolution: null,
        parserVersion: NOTIFICATION_PARSER_VERSION,
        transactionId: null,
        duplicateOf: null,
        dedupeKey: initial.dedupeKey,
      } as const;
      if (!paymentAlertCapturesRepository.insert(row))
        paymentAlertCapturesRepository.update(capture.id, {
          status,
          reason,
          resolution: null,
          parserVersion: NOTIFICATION_PARSER_VERSION,
        });
      summary.captured++;
      if (disabled) summary.ignored++;
      else summary.pending++;
      if (initial.binding.accountId) summary.accountCertain++;
      summary.captureIds.push(capture.id);
    } catch (error) {
      if (!isCurrent()) break;
      reportError(error, { scope: 'notification_review_capture' });
      // A failed local write keeps the original native capture for retry.
    }
  }
  return summary;
}
