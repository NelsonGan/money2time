// Apple Pay taps (the Log Card Payment action) are logged by AutoLogSync in
// App.tsx, outside the alert pipeline. When the bank also alerts the purchase,
// it must log once, whichever of the two queues drains first. So a tap is
// checked against recent alerts before it is logged, and recorded as an
// `apple_pay` capture after: that row is what the alert drain's cross-source
// rule (dedupe rule 3) matches a later alert against.
//
// A logged tap and its capture record commit in the same transaction. A failed
// save stays queued for retry.

import type { AutoLogPendingEntry } from '~/features/transactions/lib/autoLog';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { reportError } from '~/services/errorReporting';
import type { PaymentAlertParse, PaymentAlertResolution } from '~/types';

import { APPLE_PAY_PARSER_VERSION } from './lib/constants';
import { alertDedupeKey, captureRefOf, findDuplicate } from './lib/dedupe';

const DAY_MS = 24 * 60 * 60 * 1000;
const APPLE_PAY_SOURCE = 'apple_pay';

export type ApplePayTapCheck =
  /** Log it after checking the durable duplicate store. */
  | { action: 'log' }
  | { action: 'retry' }
  /** A bank alert already logged this payment. */
  | { action: 'skip'; twinCaptureId: string; transactionId: string | null };

export function applePayCaptureId(entryId: string): string {
  return `apple_pay-${entryId}`;
}

function capturedAtOf(entry: AutoLogPendingEntry): string {
  const time = new Date(entry.createdAt).getTime();
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

function parseOf(entry: AutoLogPendingEntry, input: CreateTransactionInput): PaymentAlertParse {
  return {
    kind: 'spend',
    amount: input.amount,
    currency: input.currency ?? null,
    secondary: null,
    counterparty: entry.merchant?.trim() || null,
    parserVersion: APPLE_PAY_PARSER_VERSION,
  };
}

/** Before logging a tap: did an alert already log, or queue, this payment? */
export function checkApplePayTap(
  entry: AutoLogPendingEntry,
  input: CreateTransactionInput,
): ApplePayTapCheck {
  try {
    const capturedAt = capturedAtOf(entry);
    const since = new Date(new Date(capturedAt).getTime() - DAY_MS).toISOString();
    const recent = paymentAlertCapturesRepository.listSince(since);
    const stored = recent.find((capture) => capture.id === applePayCaptureId(entry.id));
    if (stored?.status === 'logged' || stored?.status === 'duplicate') {
      return { action: 'skip', twinCaptureId: stored.id, transactionId: stored.transactionId };
    }
    if (recent.length === 0) return { action: 'log' };
    const parse = parseOf(entry, input);
    const verdict = findDuplicate(
      {
        id: applePayCaptureId(entry.id),
        channel: 'apple_pay',
        sourceKey: APPLE_PAY_SOURCE,
        capturedAt,
        nativeKey: null,
        dedupeKey: alertDedupeKey('apple_pay', APPLE_PAY_SOURCE, entry.id),
        kind: 'spend',
        amount: parse.amount,
        currency: parse.currency,
        counterparty: parse.counterparty,
        accountId: input.accountId ?? null,
      },
      recent.map(captureRefOf),
      // Taps never second-guessed a hand-entered payment before; they still don't.
      [],
      new Set(),
    );
    if (verdict.kind !== 'certain' || !verdict.ofCaptureId) {
      return { action: 'log' };
    }
    const twin = recent.find((capture) => capture.id === verdict.ofCaptureId);
    if (twin?.status === 'logged') {
      return { action: 'skip', twinCaptureId: twin.id, transactionId: twin.transactionId };
    }
    return { action: 'log' };
  } catch (error) {
    reportError(error, { scope: 'apple_pay_dedupe' });
    return { action: 'retry' };
  }
}

/** After the drain decided: store the tap so a later alert recognizes it. */
export function recordApplePayTap(
  entry: AutoLogPendingEntry,
  input: CreateTransactionInput,
  outcome:
    | { status: 'logged'; transactionId: string }
    | { status: 'duplicate'; transactionId: string | null; duplicateOf: string },
): void {
  const id = applePayCaptureId(entry.id);
  const merchant = entry.merchant?.trim() || null;
  const resolution: PaymentAlertResolution = {
    parse: parseOf(entry, input),
    currency: input.currency,
    accountId: input.accountId ?? null,
    certainty: entry.accountId ? 'certain' : 'guess',
    bindingReason: entry.accountId ? 'preset' : 'default',
    categoryId: input.categoryId ?? null,
    categoryOrigin: entry.categoryId ? 'preset' : null,
    draftType: 'expense',
  };
  paymentAlertCapturesRepository.insert({
    id,
    channel: 'apple_pay',
    sourceKey: APPLE_PAY_SOURCE,
    sourceLabel: entry.cardName?.trim() || null,
    capturedAt: capturedAtOf(entry),
    nativeKey: null,
    title: entry.cardName?.trim() || null,
    body: [entry.amountRaw, merchant].filter(Boolean).join(' · '),
    status: outcome.status,
    reason: outcome.status === 'logged' ? 'auto' : 'duplicate',
    resolution,
    parserVersion: APPLE_PAY_PARSER_VERSION,
    transactionId: outcome.transactionId,
    duplicateOf: outcome.status === 'duplicate' ? outcome.duplicateOf : null,
    dedupeKey: alertDedupeKey('apple_pay', APPLE_PAY_SOURCE, entry.id),
  });
}
