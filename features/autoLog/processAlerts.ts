// Runs queued payment alerts through the pipeline and writes the results:
// transactions for spending alerts and internal records for de-duplication. This is the
// I/O half of features/autoLog; the decisions themselves are the pure modules
// in ./lib. Called by PaymentAlertSync.

import type { CreateTransactionMeta } from '~/context/AppContext';
import { matchCategoryByKeywords } from '~/features/transactions/utils/categoryKeywords';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { reportError } from '~/services/errorReporting';
import type {
  Account,
  Category,
  PaymentAlertPrefs,
  QuickEntryPrefs,
  TransactionWithRelations,
} from '~/types';
import { timeFromDateLocal } from '~/utils/formatters';

import type { CaptureInput } from './lib/captureQueue';
import { autoLogAllowance } from './lib/decide';
import { type CaptureRef, captureRefOf, findDuplicate, type TransactionRef } from './lib/dedupe';
import { analyzeCapture, finalizeCapture, type PipelineContext } from './lib/pipeline';

export interface AlertProcessingDeps {
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
    autoCategorizeByMerchant: quickEntryPrefs.autoLogAutoCategorize,
    lookups: {
      keyword: (text, candidates) =>
        matchCategoryByKeywords(text, [...candidates], quickEntryPrefs.categoryMap)?.categoryId ??
        null,
    },
  };
}

/** Process alerts without a prompt. Only acknowledged captures may leave the native queue. */
export async function processAlertCaptures(
  captures: readonly CaptureInput[],
  deps: AlertProcessingDeps,
): Promise<AlertProcessingSummary> {
  const summary = emptySummary();
  const fresh = captures.filter((capture) => {
    try {
      const stored = paymentAlertCapturesRepository.getById(capture.id);
      if (!stored || stored.status === 'failed') return true;
      summary.captureIds.push(capture.id);
    } catch (error) {
      reportError(error, { scope: 'payment_alerts_store' });
    }
    return false;
  });
  if (fresh.length === 0) return summary;
  const ctx = buildPipelineContext(deps);
  const analyses = fresh.map((capture) => analyzeCapture(capture, ctx));

  // Dedupe context: captures and expenses around the batch's time span.
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
  const recentTransactions: TransactionRef[] = deps.transactions
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

  let remaining = autoLogAllowance({
    isPro: deps.isPro,
    accounts: deps.accounts,
    usedAutoLogs: deps.quickEntryPrefs.autoLogUsageCount,
  });

  for (const analysis of analyses) {
    const { capture } = analysis;
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
          deps.accounts.find((account) => account.id === analysis.binding.accountId)?.currency ??
          deps.reportingCurrency,
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
        const transactionId = deps.createTransaction(draft, {
          source: 'autolog',
          channel: capture.channel,
          decision: 'auto',
          autoLogIsPro: deps.isPro,
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
