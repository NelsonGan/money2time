// Resolve a worker-parsed notification against the selected account and categories.

import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { ScanPaymentAlertArgs } from '~/services/paymentAlertScan';
import type { ScannedTransaction } from '~/services/receiptScan.shared';
import type {
  Account,
  Category,
  PaymentAlertParse,
  PaymentAlertPrefs,
  PaymentAlertReason,
  PaymentAlertResolution,
  PaymentAlertSource,
} from '~/types';

import { type AccountBinding, bindAccount } from './binding';
import type { CaptureInput } from './captureQueue';
import { type CategoryResolution, resolveAlertCategory } from './categorize';
import { NOTIFICATION_PARSER_VERSION } from './constants';
import { type CaptureDecision, decideCapture } from './decide';
import { alertDedupeKey, type DuplicateVerdict } from './dedupe';
import { buildAlertDraft } from './draft';
import { findAlertSource, matchesIgnorePhrase } from './prefs';
import { normalizeAlertText } from './text';

export interface PipelineContext {
  accounts: readonly Account[];
  categories: readonly Category[];
  prefs: PaymentAlertPrefs;
  reportingCurrency: string;
  defaultExpenseCategoryId: string | null;
  defaultIncomeCategoryId: string | null;
}

export interface CaptureAnalysis {
  capture: CaptureInput;
  dedupeKey: string;
  lowerText: string;
  parse: PaymentAlertParse;
  source: PaymentAlertSource | null;
  binding: AccountBinding;
  category: CategoryResolution;
  ignoredByPhrase: boolean;
}

export function analyzeCapture(
  capture: CaptureInput,
  ctx: PipelineContext,
  scanned: ScannedTransaction | null,
): CaptureAnalysis {
  const parse: PaymentAlertParse = {
    kind: scanned ? (scanned.type === 'income' ? 'income' : 'spend') : 'unknown',
    amount: scanned?.amount ?? null,
    currency: scanned?.currency ?? null,
    secondary: scanned?.secondary ?? null,
    counterparty: scanned?.note.trim() || null,
    parserVersion: NOTIFICATION_PARSER_VERSION,
  };
  const lowerText = normalizeAlertText([
    capture.title,
    capture.subtitle,
    capture.body,
    ...capture.extra,
  ]).lower;
  const source =
    capture.channel === 'android_notification'
      ? findAlertSource(ctx.prefs, capture.channel, capture.sourceKey)
      : null;
  const binding = bindAccount({
    presetAccountId: capture.presetAccountId,
    source,
    accounts: ctx.accounts,
  });
  const category = resolveAlertCategory({
    kind: parse.kind,
    scannedCategory: scanned?.category ?? null,
    presetCategoryId: capture.presetCategoryId,
    categories: ctx.categories,
    defaultExpenseCategoryId: ctx.defaultExpenseCategoryId,
    defaultIncomeCategoryId: ctx.defaultIncomeCategoryId,
  });

  return {
    capture,
    dedupeKey: alertDedupeKey(capture.channel, capture.sourceKey, lowerText),
    lowerText,
    parse,
    source,
    binding,
    category,
    ignoredByPhrase: matchesIgnorePhrase(ctx.prefs, source, lowerText),
  };
}

export interface CaptureOutcome {
  resolution: PaymentAlertResolution;
  decision: CaptureDecision;
  draft: CreateTransactionInput | null;
}

/** Local gates run before upload and again after a potentially slow response. */
export function captureSkipReason(
  analysis: CaptureAnalysis,
  ctx: PipelineContext,
  remaining: number | null,
): PaymentAlertReason | null {
  const { capture } = analysis;
  if (
    (capture.channel === 'android_notification' &&
      (!ctx.prefs.alertsEnabled || !analysis.source?.enabled)) ||
    (capture.channel !== 'android_notification' && capture.channel !== 'ios_alert')
  )
    return 'source_disabled';
  if (analysis.ignoredByPhrase) return 'ignore_phrase';
  if (analysis.binding.certainty !== 'certain') return 'account_uncertain';
  if (remaining !== null && remaining <= 0) return 'limit_reached';
  return null;
}

export function buildNotificationScanArgs(
  capture: CaptureInput,
  ctx: PipelineContext,
  appUserId: string,
  accountId: string | null,
): ScanPaymentAlertArgs {
  return {
    appUserId,
    currency:
      ctx.accounts.find((account) => account.id === accountId)?.currency ?? ctx.reportingCurrency,
    categories: ctx.categories
      .filter((category) => category.type === 'expense' && !category.deletedAt)
      .map((category) => category.name),
    incomeCategories: ctx.categories
      .filter((category) => category.type === 'income' && !category.deletedAt)
      .map((category) => category.name),
    notification: {
      title: capture.title,
      subtitle: capture.subtitle,
      body: capture.body,
      extra: capture.extra,
      source: capture.sourceLabel ?? capture.sourceKey,
      capturedAt: capture.capturedAt,
    },
  };
}

export function finalizeCapture(
  analysis: CaptureAnalysis,
  ctx: PipelineContext,
  options: {
    duplicate: DuplicateVerdict;
    /** Automatic logs left on the free tier; null when unlimited. */
    autoLogsRemaining: number | null;
  },
): CaptureOutcome {
  const category = analysis.category;

  const draft = buildAlertDraft({
    parse: analysis.parse,
    capturedAt: analysis.capture.capturedAt,
    accountId: analysis.binding.accountId,
    categoryId: category.categoryId,
    accounts: ctx.accounts,
    reportingCurrency: ctx.reportingCurrency,
  });

  const decision = decideCapture({
    parse: analysis.parse,
    certainty: analysis.binding.certainty,
    duplicate: options.duplicate,
    captureEnabled: analysis.capture.channel !== 'android_notification' || ctx.prefs.alertsEnabled,
    source:
      analysis.source ??
      (analysis.capture.channel === 'ios_alert' && analysis.binding.certainty === 'certain'
        ? {
            channel: analysis.capture.channel,
            sourceKey: analysis.capture.sourceKey,
            label: analysis.capture.sourceLabel ?? analysis.capture.sourceKey,
            enabled: true,
            accountId: analysis.binding.accountId,
            ignorePhrases: [],
            addedAt: analysis.capture.capturedAt,
          }
        : null),
    ignoredByPhrase: analysis.ignoredByPhrase,
    autoLogsRemaining: options.autoLogsRemaining,
  });

  return {
    resolution: {
      parse: analysis.parse,
      scanCurrency:
        ctx.accounts.find((account) => account.id === analysis.binding.accountId)?.currency ??
        ctx.reportingCurrency,
      currency: draft?.currency ?? analysis.parse.currency,
      accountId: analysis.binding.accountId,
      certainty: analysis.binding.certainty,
      bindingReason: analysis.binding.reason,
      categoryId: category.categoryId,
      categoryOrigin: category.origin,
      draftType: draft?.type ?? null,
    },
    // A draft that cannot be built (no amount) can only be ignored.
    decision:
      draft || decision.action === 'ignore' || decision.action === 'duplicate'
        ? decision
        : { action: 'ignore', reason: 'no_amount' },
    draft,
  };
}
