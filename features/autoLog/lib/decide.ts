// What to do with one alert: log, ignore, or skip a duplicate. Pure; covered by
// __tests__/features/autoLog/decisions.test.ts.

import { PRO_LIMITS } from '~/constants/proLimits';
import {
  countAccountsTowardFreeLimit,
  isNewTransactionBlockedByAccounts,
} from '~/features/transactions/lib/accountEntryGate';
import type {
  Account,
  AccountBindingCertainty,
  PaymentAlertParse,
  PaymentAlertReason,
  PaymentAlertSource,
} from '~/types';

import type { DuplicateVerdict } from './dedupe';

export type CaptureDecision =
  | { action: 'log'; reason: 'auto' }
  | { action: 'ignore'; reason: PaymentAlertReason }
  | { action: 'duplicate'; reason: 'duplicate' };

export interface DecisionInput {
  parse: PaymentAlertParse;
  certainty: AccountBindingCertainty;
  duplicate: DuplicateVerdict;
  /** The configured source; null for an unconfigured one, which is ignored. */
  source: PaymentAlertSource | null;
  /** An ignore phrase (global or the source's) matched the alert. */
  ignoredByPhrase: boolean;
  /** Automatic logs left on the free tier; null when unlimited (Pro). */
  autoLogsRemaining: number | null;
}

/** Kinds that are never a transaction, and the reason they are ignored under. */
const IGNORED_KINDS: Partial<Record<PaymentAlertParse['kind'], PaymentAlertReason>> = {
  otp: 'otp',
  promo: 'promo',
  declined: 'declined',
  balance: 'balance',
  unknown: 'no_amount',
};

export function decideCapture(input: DecisionInput): CaptureDecision {
  const { parse } = input;

  if (input.source && !input.source.enabled) return { action: 'ignore', reason: 'source_disabled' };
  if (input.ignoredByPhrase) return { action: 'ignore', reason: 'ignore_phrase' };
  const ignoredAs = IGNORED_KINDS[parse.kind];
  if (ignoredAs) return { action: 'ignore', reason: ignoredAs };
  if (parse.amount === null) return { action: 'ignore', reason: 'no_amount' };

  if (input.duplicate.kind === 'certain') return { action: 'duplicate', reason: 'duplicate' };
  if (input.duplicate.kind === 'possible') return { action: 'duplicate', reason: 'duplicate' };
  if (input.duplicate.kind === 'reversal') return { action: 'ignore', reason: 'refund' };
  if (parse.kind === 'income' || parse.kind === 'refund' || parse.kind === 'transfer')
    return { action: 'ignore', reason: parse.kind };
  if (parse.kind !== 'spend') return { action: 'ignore', reason: 'no_amount' };
  if (!input.source) return { action: 'ignore', reason: 'source_disabled' };
  if (input.certainty !== 'certain') return { action: 'ignore', reason: 'account_uncertain' };
  if (input.autoLogsRemaining !== null && input.autoLogsRemaining <= 0) {
    return { action: 'ignore', reason: 'limit_reached' };
  }
  return { action: 'log', reason: 'auto' };
}

/**
 * Automatic logs the free tier has left; null when unlimited (Pro). A free
 * account over its account limit cannot add transactions by hand, so alerts do
 * not add them either. The existing automatic-log cap still applies.
 */
export function autoLogAllowance(input: {
  isPro: boolean;
  accounts: readonly Account[];
  usedAutoLogs: number;
}): number | null {
  if (input.isPro) return null;
  if (isNewTransactionBlockedByAccounts(false, countAccountsTowardFreeLimit(input.accounts))) {
    return 0;
  }
  return Math.max(0, PRO_LIMITS.FREE_MAX_AUTO_LOGS - input.usedAutoLogs);
}
