// Runs queued payment alerts through the pipeline and writes the results:
// transactions for expenses and income and internal records for de-duplication. This is the
// I/O half of features/autoLog; the decisions themselves are the pure modules
// in ./lib. Called by PaymentAlertSync.

import type { CreateTransactionMeta } from '~/context/AppContext';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { reportError } from '~/services/errorReporting';
import { paymentAlertProcessingGeneration } from '~/services/paymentAlertsBridge';
import { notificationTransactionOf, scanPaymentAlert } from '~/services/paymentAlertScan';
import type { ScannedTransaction } from '~/services/receiptScan.shared';
import type {
  Account,
  Category,
  PaymentAlertPrefs,
  QuickEntryPrefs,
  TransactionWithRelations,
} from '~/types';
import { timeFromDateLocal } from '~/utils/formatters';

import type { CaptureInput } from './lib/captureQueue';
import { NOTIFICATION_PARSER_VERSION } from './lib/constants';
import { autoLogAllowance } from './lib/decide';
import { type CaptureRef, captureRefOf, findDuplicate, type TransactionRef } from './lib/dedupe';
import {
  analyzeCapture,
  buildNotificationScanArgs,
  captureSkipReason,
  finalizeCapture,
  type PipelineContext,
} from './lib/pipeline';

export interface AlertProcessingDeps {
  accounts: readonly Account[];
  categories: readonly Category[];
  /** Live transactions, newest first. */
  transactions: readonly TransactionWithRelations[];
  prefs: PaymentAlertPrefs;
  reportingCurrency: string;
  appUserId: string;
  quickEntryPrefs: QuickEntryPrefs;
  isPro: boolean;
  createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => string;
  /** Re-read settings/accounts/transactions after waiting for worker inference. */
  getCurrent?: () => AlertProcessingDeps;
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
    'accounts' | 'categories' | 'prefs' | 'reportingCurrency' | 'quickEntryPrefs'
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

/** Process alerts without a prompt. Only acknowledged captures may leave the native queue. */
export async function processAlertCaptures(
  captures: readonly CaptureInput[],
  deps: AlertProcessingDeps,
): Promise<AlertProcessingSummary> {
  const generation = paymentAlertProcessingGeneration();
  const summary = emptySummary();
  const savedParses = new Map<string, { scanned: ScannedTransaction; currency: string }>();
  const fresh = captures.filter((capture) => {
    try {
      const stored = paymentAlertCapturesRepository.getById(capture.id);
      if (!stored || stored.status === 'failed' || stored.status === 'pending') {
        const parse = stored?.resolution?.parse;
        if (
          parse?.parserVersion === NOTIFICATION_PARSER_VERSION &&
          stored?.resolution?.scanCurrency
        ) {
          try {
            savedParses.set(capture.id, {
              currency: stored.resolution.scanCurrency,
              scanned: notificationTransactionOf({
                type:
                  parse.kind === 'income' ? 'income' : parse.kind === 'spend' ? 'expense' : null,
                amount: parse.amount,
                currency: parse.currency,
                category:
                  deps.categories.find((category) => category.id === stored.resolution?.categoryId)
                    ?.name ?? '',
                note: parse.counterparty ?? '',
                secondary: parse.secondary,
              }),
            });
          } catch {
            // A legacy or damaged result needs fresh inference.
          }
        }
        return true;
      }
      summary.captureIds.push(capture.id);
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_store' });
    }
    return false;
  });
  if (fresh.length === 0) return summary;
  let activeDeps = deps.getCurrent?.() ?? deps;
  let ctx = buildPipelineContext(activeDeps);

  // Dedupe context: captures and transactions around the batch's time span.
  const times = fresh.map((capture) => new Date(capture.capturedAt).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const since = new Date(earliest - 4 * DAY_MS).toISOString();
  const recentCaptures: CaptureRef[] = paymentAlertCapturesRepository
    .listSince(since)
    .map(captureRefOf);
  const transactionIdsFromCaptures = new Set(
    paymentAlertCapturesRepository.listLoggedTransactionIds(since),
  );
  const transactionRefs = (transactions: readonly TransactionWithRelations[]): TransactionRef[] =>
    transactions
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

  let recentTransactions = transactionRefs(activeDeps.transactions);

  // React state may lag synchronous saves. Keep a local floor while also
  // observing writes from the other drain and subscription changes.
  let usageFloor = activeDeps.quickEntryPrefs.autoLogUsageCount;
  const currentAllowance = () => {
    usageFloor = Math.max(usageFloor, activeDeps.quickEntryPrefs.autoLogUsageCount);
    return autoLogAllowance({
      isPro: activeDeps.isPro,
      accounts: activeDeps.accounts,
      usedAutoLogs: usageFloor,
    });
  };

  for (const capture of fresh) {
    activeDeps = deps.getCurrent?.() ?? deps;
    ctx = buildPipelineContext(activeDeps);
    let remaining = currentAllowance();
    let analysis = analyzeCapture(capture, ctx, null);
    let skipReason = captureSkipReason(analysis, ctx, remaining);
    if (!skipReason) {
      try {
        let stableCurrency = false;
        // A setting change can alter how "$" is interpreted. Retry once with
        // the latest currency; repeated changes leave the alert queued.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const args = buildNotificationScanArgs(
            capture,
            ctx,
            activeDeps.appUserId,
            analysis.binding.accountId,
          );
          const cached = savedParses.get(capture.id);
          const scanned =
            cached?.currency === args.currency ? cached.scanned : await scanPaymentAlert(args);
          if (generation !== paymentAlertProcessingGeneration()) return summary;
          activeDeps = deps.getCurrent?.() ?? deps;
          ctx = buildPipelineContext(activeDeps);
          remaining = currentAllowance();
          analysis = analyzeCapture(capture, ctx, scanned);
          skipReason = captureSkipReason(analysis, ctx, remaining);
          stableCurrency =
            skipReason !== null ||
            buildNotificationScanArgs(
              capture,
              ctx,
              activeDeps.appUserId,
              analysis.binding.accountId,
            ).currency === args.currency;
          if (stableCurrency) break;
        }
        if (!stableCurrency) continue;
        recentTransactions = transactionRefs(activeDeps.transactions);
        // Apple Pay can commit while notification inference is awaiting the
        // network. Re-read its durable capture before making a log decision.
        const byId = new Map(recentCaptures.map((ref) => [ref.id, ref]));
        for (const stored of paymentAlertCapturesRepository.listSince(since))
          byId.set(stored.id, captureRefOf(stored));
        recentCaptures.splice(0, recentCaptures.length, ...byId.values());
        for (const id of paymentAlertCapturesRepository.listLoggedTransactionIds(since))
          transactionIdsFromCaptures.add(id);
      } catch (error) {
        // Offline, quota and malformed responses are retryable and never acknowledged.
        reportError(error, { scope: 'payment_alerts_parse' });
        continue;
      }
    }
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
          ctx.accounts.find((account) => account.id === analysis.binding.accountId)?.currency ??
          ctx.reportingCurrency,
        accountId: analysis.binding.accountId,
        counterparty: analysis.parse.counterparty,
      },
      recentCaptures,
      recentTransactions,
      transactionIdsFromCaptures,
    );
    const outcome = finalizeCapture(analysis, ctx, {
      duplicate,
      autoLogsRemaining: remaining,
    });
    if (skipReason) outcome.decision = { action: 'ignore', reason: skipReason };
    const { decision, resolution, draft } = outcome;

    const status =
      decision.action === 'ignore'
        ? 'ignored'
        : decision.action === 'duplicate'
          ? 'duplicate'
          : 'failed';
    const duplicateOf =
      duplicate.kind === 'certain' || duplicate.kind === 'possible'
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
        title: capture.title,
        body: [capture.subtitle, capture.body, ...capture.extra].filter(Boolean).join('\n'),
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
        const transactionId = activeDeps.createTransaction(draft, {
          source: 'autolog',
          channel: capture.channel,
          decision: 'auto',
          autoLogIsPro: activeDeps.isPro,
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
        usageFloor += 1;
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
