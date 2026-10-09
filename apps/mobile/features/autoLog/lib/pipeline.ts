// Resolve scanner output against the explicitly configured account and live categories.

import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
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
import { type CaptureDecision, decideCapture } from './decide';
import { alertDedupeKey, type DuplicateVerdict } from './dedupe';
import { buildAlertDraft } from './draft';
import { notificationParse } from './notification';
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
  parse: PaymentAlertParse = notificationParse(),
): CaptureAnalysis {
  const parts = {
    title: capture.title,
    subtitle: capture.subtitle,
    body: capture.body,
    extra: capture.extra,
  };
  const lowerText = normalizeAlertText([
    parts.title,
    parts.subtitle,
    parts.body,
    ...parts.extra,
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
    scannedCategory: parse.category ?? null,
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

/** Source/account/user-filter guards also run before any text leaves the device. */
export function captureSkipReason(
  analysis: CaptureAnalysis,
  ctx: PipelineContext,
): PaymentAlertReason | null {
  if (
    analysis.capture.channel === 'android_notification' &&
    (!ctx.prefs.alertsEnabled || !analysis.source?.enabled)
  )
    return 'source_disabled';
  if (analysis.ignoredByPhrase) return 'ignore_phrase';
  if (analysis.binding.certainty !== 'certain') return 'account_uncertain';
  return null;
}

export interface CaptureOutcome {
  resolution: PaymentAlertResolution;
  decision: CaptureDecision;
  draft: CreateTransactionInput | null;
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

  const skip = captureSkipReason(analysis, ctx);
  const decision: CaptureDecision = skip
    ? { action: 'ignore', reason: skip }
    : options.autoLogsRemaining === 0
      ? { action: 'ignore', reason: 'limit_reached' }
      : decideCapture({
          parse: analysis.parse,
          certainty: analysis.binding.certainty,
          duplicate: options.duplicate,
          captureEnabled:
            analysis.capture.channel !== 'android_notification' || ctx.prefs.alertsEnabled,
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
      currency: draft?.currency ?? analysis.parse.currency,
      accountId: analysis.binding.accountId,
      certainty: analysis.binding.certainty,
      bindingReason: analysis.binding.reason,
      identifier: analysis.binding.identifier,
      candidateAccountIds: analysis.binding.candidateAccountIds,
      categoryId: category.categoryId,
      categoryOrigin: category.origin,
      draftType: draft?.type ?? null,
      transferFromAccountId: draft?.type === 'transfer' ? (draft.fromAccountId ?? null) : null,
      transferToAccountId: draft?.type === 'transfer' ? (draft.toAccountId ?? null) : null,
    },
    // A draft that cannot be built (no amount) can only be ignored.
    decision:
      draft || decision.action === 'ignore' || decision.action === 'duplicate'
        ? decision
        : { action: 'ignore', reason: 'no_amount' },
    draft,
  };
}
