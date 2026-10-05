// On-device pipeline: parse, select the configured account, match keywords and log.

import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type {
  Account,
  Category,
  PaymentAlertParse,
  PaymentAlertPrefs,
  PaymentAlertResolution,
  PaymentAlertSource,
} from '~/types';

import { type AccountBinding, bindAccount } from './binding';
import type { CaptureInput } from './captureQueue';
import { type CategoryLookups, type CategoryResolution, resolveAlertCategory } from './categorize';
import { type CaptureDecision, decideCapture } from './decide';
import { alertDedupeKey, type DuplicateVerdict } from './dedupe';
import { buildAlertDraft } from './draft';
import { normalizedAlertLower, parsePaymentAlert } from './parser';
import { findAlertSource, matchesIgnorePhrase } from './prefs';

export interface PipelineContext {
  accounts: readonly Account[];
  categories: readonly Category[];
  prefs: PaymentAlertPrefs;
  reportingCurrency: string;
  defaultExpenseCategoryId: string | null;
  autoCategorizeByMerchant: boolean;
  lookups: CategoryLookups;
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

export function analyzeCapture(capture: CaptureInput, ctx: PipelineContext): CaptureAnalysis {
  const parts = {
    title: capture.title,
    subtitle: capture.subtitle,
    body: capture.body,
    extra: capture.extra,
  };
  const parse = parsePaymentAlert(parts);
  const lowerText = normalizedAlertLower(parts);
  const source = findAlertSource(ctx.prefs, capture.channel, capture.sourceKey);
  const binding = bindAccount({
    presetAccountId: capture.presetAccountId,
    source,
    accounts: ctx.accounts,
  });
  const category = resolveAlertCategory(
    {
      kind: parse.kind,
      counterparty: parse.counterparty,
      presetCategoryId: capture.presetCategoryId,
      categories: ctx.categories,
      defaultExpenseCategoryId: ctx.defaultExpenseCategoryId,
      autoCategorizeByMerchant: ctx.autoCategorizeByMerchant,
    },
    ctx.lookups,
  );

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
    source:
      analysis.source ??
      (analysis.binding.certainty === 'certain'
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
