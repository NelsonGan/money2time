// Runs queued payment alerts through the pipeline and writes the results:
// transactions for completed payment alerts and internal records for de-duplication. This is the
// I/O half of features/autoLog; the decisions themselves are the pure modules
// in ./lib. Called by PaymentAlertSync.

import type { CreateTransactionMeta } from '~/context/AppContext';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { reportError } from '~/services/errorReporting';
import { ReceiptScanError, scanNotification } from '~/services/receiptScan';
import type {
  Account,
  Category,
  PaymentAlertParse,
  PaymentAlertPrefs,
  QuickEntryPrefs,
  TransactionWithRelations,
} from '~/types';
import { timeFromDateLocal } from '~/utils/formatters';

import type { CaptureInput } from './lib/captureQueue';
import { autoLogAllowance } from './lib/decide';
import { type CaptureRef, captureRefOf, findDuplicate, type TransactionRef } from './lib/dedupe';
import { NOTIFICATION_PARSER_VERSION, notificationParse } from './lib/notification';
import {
  analyzeCapture,
  type CaptureAnalysis,
  captureSkipReason,
  finalizeCapture,
  type PipelineContext,
} from './lib/pipeline';
import { hasNativeAlertTruncation, MAX_ALERT_TEXT_LENGTH, normalizeAlertText } from './lib/text';

export interface AlertProcessingDeps {
  appUserId: string;
  /** Re-read live preferences/accounts after a slow network request. */
  getCurrent?: () => AlertProcessingDeps;
  accounts: readonly Account[];
  categories: readonly Category[];
  /** Live transactions, newest first. */
  transactions: readonly TransactionWithRelations[];
  prefs: PaymentAlertPrefs;
  reportingCurrency: string;
  quickEntryPrefs: QuickEntryPrefs;
  isPro: boolean;
  createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => string;
}

export interface AlertProcessingSummary {
  captured: number;
  logged: number;
  ignored: number;
  duplicates: number;
  accountCertain: number;
  loggedTransactionIds: string[];
  /** Ids of the captures written, in order. */
  captureIds: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptySummary(): AlertProcessingSummary {
  return {
    captured: 0,
    logged: 0,
    ignored: 0,
    duplicates: 0,
    accountCertain: 0,
    loggedTransactionIds: [],
    captureIds: [],
  };
}

export function buildPipelineContext(
  deps: Pick<
    AlertProcessingDeps,
    'accounts' | 'categories' | 'transactions' | 'prefs' | 'reportingCurrency' | 'quickEntryPrefs'
  >,
): PipelineContext {
  const { quickEntryPrefs } = deps;
  return {
    accounts: deps.accounts,
    categories: deps.categories,
    prefs: deps.prefs,
    reportingCurrency: deps.reportingCurrency,
    defaultExpenseCategoryId: quickEntryPrefs.defaultExpenseCategoryId,
    defaultIncomeCategoryId: quickEntryPrefs.defaultIncomeCategoryId,
  };
}

/** Shared by real drains and setup previews; no keyword fallback on failure. */
export async function analyzeNotificationCapture(
  capture: CaptureInput,
  deps: AlertProcessingDeps,
  saved?: PaymentAlertParse,
): Promise<CaptureAnalysis> {
  const current = deps.getCurrent?.() ?? deps;
  const ctx = buildPipelineContext(current);
  const initial = analyzeCapture(capture, ctx);
  if (
    captureSkipReason(initial, ctx) ||
    autoLogAllowance({
      isPro: current.isPro,
      accounts: current.accounts,
      usedAutoLogs: current.quickEntryPrefs.autoLogUsageCount,
    }) === 0
  )
    return initial;
  if (!current.prefs.notificationScanningEnabled)
    throw new ReceiptScanError('not_available', 'Notification scanning is disabled.');
  if (
    capture.possiblyTruncated ??
    hasNativeAlertTruncation([capture.title, capture.subtitle, capture.body, ...capture.extra])
  )
    return initial;
  const account = current.accounts.find((item) => item.id === initial.binding.accountId);
  const scanCurrency = account?.currency ?? current.reportingCurrency;
  // A resolved currency may have come from the selected account, rather than
  // the text. Cached results are safe only with the same fallback context.
  let parse = saved?.scanCurrency === scanCurrency ? saved : undefined;
  if (!parse) {
    const text = normalizeAlertText([
      // Native setup tests are preview-only. Their visible "test" label would
      // correctly make the classifier reject an otherwise realistic sample.
      capture.isTest ? null : capture.title,
      capture.subtitle,
      capture.body,
      ...capture.extra,
    ]).text;
    // Do not truncate: a late "failed" or promotional condition changes meaning.
    if (!text || text.length > MAX_ALERT_TEXT_LENGTH) return initial;
    const result = await scanNotification({
      appUserId: current.appUserId,
      text,
      capturedAt: capture.capturedAt,
      currency: scanCurrency,
      categories: current.categories
        .filter((item) => item.type === 'expense' && !item.deletedAt)
        .map((item) => item.name),
      incomeCategories: current.categories
        .filter((item) => item.type === 'income' && !item.deletedAt)
        .map((item) => item.name),
    });
    parse = notificationParse(result, scanCurrency);
  }
  const latest = deps.getCurrent?.() ?? deps;
  const latestContext = buildPipelineContext(latest);
  const analysis = analyzeCapture(capture, latestContext, parse);
  if (!latest.prefs.notificationScanningEnabled && !captureSkipReason(analysis, latestContext))
    throw new ReceiptScanError('not_available', 'Notification scanning was disabled.');
  const latestAccount = latest.accounts.find((item) => item.id === analysis.binding.accountId);
  if (
    !captureSkipReason(analysis, latestContext) &&
    scanCurrency !== (latestAccount?.currency ?? latest.reportingCurrency)
  )
    throw new ReceiptScanError(
      'not_available',
      'Notification scan currency changed. Retry needed.',
    );
  return analysis;
}

/** Process alerts without a prompt. Only acknowledged captures may leave the native queue. */
export async function processAlertCaptures(
  captures: readonly CaptureInput[],
  deps: AlertProcessingDeps,
): Promise<AlertProcessingSummary> {
  const summary = emptySummary();
  const savedParses = new Map<string, PaymentAlertParse>();
  const fresh = captures.filter((capture) => {
    try {
      const stored = paymentAlertCapturesRepository.getById(capture.id);
      if (!stored || stored.status === 'failed') {
        const parse = stored?.resolution?.parse;
        if (
          parse?.parserVersion === NOTIFICATION_PARSER_VERSION &&
          parse.signals.includes('notification_scanner')
        )
          savedParses.set(capture.id, parse);
        return true;
      }
      summary.captureIds.push(capture.id);
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_store' });
    }
    return false;
  });
  if (fresh.length === 0) return summary;

  // Dedupe context: captures and transactions around the batch's time span.
  const times = fresh.map((capture) => new Date(capture.capturedAt).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const since = new Date(earliest - 4 * DAY_MS).toISOString();
  const recentCaptures: CaptureRef[] = [];
  const transactionIdsFromCaptures = new Set(
    paymentAlertCapturesRepository.listLoggedTransactionIds(since),
  );

  let remaining = autoLogAllowance({
    isPro: deps.isPro,
    accounts: deps.accounts,
    usedAutoLogs: deps.quickEntryPrefs.autoLogUsageCount,
  });

  for (const capture of fresh) {
    let current = deps.getCurrent?.() ?? deps;
    remaining = autoLogAllowance({
      isPro: current.isPro,
      accounts: current.accounts,
      usedAutoLogs: Math.max(
        current.quickEntryPrefs.autoLogUsageCount,
        deps.quickEntryPrefs.autoLogUsageCount + summary.logged,
      ),
    });
    let analysis: CaptureAnalysis;
    try {
      analysis =
        remaining === 0
          ? analyzeCapture(capture, buildPipelineContext(current))
          : await analyzeNotificationCapture(capture, deps, savedParses.get(capture.id));
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_scan' });
      // A service failure is not a classification. Preserve the native copy.
      // These failures apply to the whole batch; retry on the next drain.
      if (
        error instanceof ReceiptScanError &&
        ['network', 'capacity', 'limit_reached', 'not_available'].includes(error.code)
      )
        break;
      continue;
    }
    current = deps.getCurrent?.() ?? deps;
    const ctx = buildPipelineContext(current);
    if (!current.prefs.notificationScanningEnabled && !captureSkipReason(analysis, ctx)) continue;
    analysis = analyzeCapture(capture, ctx, analysis.parse);
    remaining = autoLogAllowance({
      isPro: current.isPro,
      accounts: current.accounts,
      usedAutoLogs: Math.max(
        current.quickEntryPrefs.autoLogUsageCount,
        deps.quickEntryPrefs.autoLogUsageCount + summary.logged,
      ),
    });
    // A manual entry or Apple Pay capture may arrive while inference is pending.
    // Refresh both sources before deciding whether to write another transaction.
    const recentTransactions: TransactionRef[] = current.transactions
      .filter((transaction) => {
        const when = timeFromDateLocal(transaction.date);
        return when >= earliest - 4 * DAY_MS && when <= latest + DAY_MS;
      })
      .map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        date: transaction.date,
        note: transaction.note ?? null,
        recurrenceParentId: transaction.recurrenceParentId ?? null,
        accountId: transaction.accountId ?? null,
      }));
    const currentCaptures = new Map(
      paymentAlertCapturesRepository.listSince(since).map((item) => [item.id, captureRefOf(item)]),
    );
    for (const item of recentCaptures)
      if (!currentCaptures.has(item.id)) currentCaptures.set(item.id, item);
    for (const id of paymentAlertCapturesRepository.listLoggedTransactionIds(since))
      transactionIdsFromCaptures.add(id);
    const duplicate = findDuplicate(
      {
        id: capture.id,
        channel: capture.channel,
        sourceKey: capture.sourceKey,
        capturedAt: capture.capturedAt,
        nativeKey: capture.nativeKey,
        dedupeKey: analysis.dedupeKey,
        kind: analysis.parse.kind,
        amount: analysis.parse.amount,
        currency:
          analysis.parse.currency ??
          current.accounts.find((account) => account.id === analysis.binding.accountId)?.currency ??
          current.reportingCurrency,
        accountId: analysis.binding.accountId,
        counterparty: analysis.parse.counterparty,
      },
      [...currentCaptures.values()],
      recentTransactions,
      transactionIdsFromCaptures,
    );
    const outcome = finalizeCapture(analysis, ctx, {
      duplicate,
      autoLogsRemaining: remaining,
    });
    const { decision, resolution, draft } = outcome;

    const status =
      decision.action === 'ignore'
        ? 'ignored'
        : decision.action === 'duplicate'
          ? 'duplicate'
          : 'failed';
    const duplicateOf =
      duplicate.kind === 'certain' || duplicate.kind === 'possible' || duplicate.kind === 'reversal'
        ? (duplicate.ofCaptureId ?? duplicate.ofTransactionId ?? null)
        : null;

    try {
      const inserted = paymentAlertCapturesRepository.insert({
        id: capture.id,
        channel: capture.channel,
        sourceKey: capture.sourceKey,
        sourceLabel: capture.sourceLabel,
        capturedAt: capture.capturedAt,
        nativeKey: capture.nativeKey,
        title: status === 'ignored' ? null : capture.title,
        body:
          status === 'ignored'
            ? null
            : [capture.subtitle, capture.body, ...capture.extra].filter(Boolean).join('\n'),
        status,
        reason: decision.reason,
        resolution,
        parserVersion: analysis.parse.parserVersion,
        transactionId: null,
        duplicateOf,
        dedupeKey: analysis.dedupeKey,
      });
      if (!inserted)
        paymentAlertCapturesRepository.update(capture.id, {
          status,
          reason: decision.reason,
          resolution,
          duplicateOf,
          parserVersion: analysis.parse.parserVersion,
        });
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_store' });
      continue;
    }
    summary.captured += 1;
    if (resolution.certainty === 'certain') summary.accountCertain += 1;

    if (duplicate.kind === 'none' && duplicate.supersedesCaptureId) {
      paymentAlertCapturesRepository.update(duplicate.supersedesCaptureId, {
        status: 'duplicate',
        reason: 'superseded',
        duplicateOf: capture.id,
      });
    }

    const ref: CaptureRef = {
      id: capture.id,
      channel: capture.channel,
      sourceKey: capture.sourceKey,
      capturedAt: capture.capturedAt,
      nativeKey: capture.nativeKey,
      dedupeKey: analysis.dedupeKey,
      status,
      kind: analysis.parse.kind,
      amount: analysis.parse.amount,
      currency: draft?.currency ?? analysis.parse.currency,
      accountId: resolution.accountId,
      counterparty: analysis.parse.counterparty,
      transactionId: null,
    };

    if (decision.action === 'log' && draft) {
      try {
        const transactionId = current.createTransaction(draft, {
          source: 'autolog',
          channel: capture.channel,
          decision: 'auto',
          autoLogIsPro: current.isPro,
          onAutoLogPersisted: (persistedId) =>
            paymentAlertCapturesRepository.update(capture.id, {
              status: 'logged',
              reason: 'auto',
              transactionId: persistedId,
            }),
        });
        ref.status = 'logged';
        ref.transactionId = transactionId;
        transactionIdsFromCaptures.add(transactionId);
        summary.logged += 1;
        summary.loggedTransactionIds.push(transactionId);
        if (remaining !== null) remaining -= 1;
      } catch (error) {
        // Keep the native copy so a later foreground can retry automatically.
        reportError(error, { scope: 'payment_alerts_log' });
        recentCaptures.push(ref);
        continue;
      }
    } else if (status === 'ignored') {
      summary.ignored += 1;
    } else {
      summary.duplicates += 1;
    }
    summary.captureIds.push(capture.id);
    recentCaptures.push(ref);
  }

  return summary;
}
