// Recognizing the same payment twice: a notification re-posted or updated,
// the bank app and the wallet both announcing one purchase, an Apple Pay tap
// that the bank also alerts, or a payment the user already typed in. Pure;
// covered by __tests__/features/autoLog/decisions.test.ts. Rules are in
// docs/prd-notification-auto-log.md.

import type {
  PaymentAlertCapture,
  PaymentAlertChannel,
  PaymentAlertKind,
  PaymentAlertStatus,
} from '~/types';
import { timeFromDateLocal } from '~/utils/formatters';

/** A previously stored capture, as much as dedupe needs. */
export interface CaptureRef {
  id: string;
  channel: PaymentAlertChannel;
  sourceKey: string;
  capturedAt: string;
  nativeKey: string | null;
  dedupeKey: string | null;
  status: PaymentAlertStatus;
  kind: PaymentAlertKind | null;
  amount: number | null;
  currency: string | null;
  transactionId: string | null;
  accountId: string | null;
  counterparty: string | null;
}

/** A stored capture as dedupe sees it. */
export function captureRefOf(capture: PaymentAlertCapture): CaptureRef {
  return {
    id: capture.id,
    channel: capture.channel,
    sourceKey: capture.sourceKey,
    capturedAt: capture.capturedAt,
    nativeKey: capture.nativeKey,
    dedupeKey: capture.dedupeKey,
    status: capture.status,
    kind: capture.resolution?.parse.kind ?? null,
    amount: capture.resolution?.parse.amount ?? null,
    currency: capture.resolution?.currency ?? capture.resolution?.parse.currency ?? null,
    transactionId: capture.transactionId,
    accountId: capture.resolution?.accountId ?? null,
    counterparty: capture.resolution?.parse.counterparty ?? null,
  };
}

/** A transaction already in the ledger. */
export interface TransactionRef {
  id: string;
  type: string;
  amount: number;
  currency: string;
  /** Day key or full ISO string, as stored. */
  date: string;
  note: string | null;
  recurrenceParentId: string | null;
  accountId: string | null;
}

export interface IncomingCapture {
  id: string;
  channel: PaymentAlertChannel;
  sourceKey: string;
  capturedAt: string;
  nativeKey: string | null;
  dedupeKey: string;
  kind: PaymentAlertKind;
  amount: number | null;
  currency: string | null;
  counterparty: string | null;
  accountId: string | null;
}

export type DuplicateVerdict =
  | { kind: 'none'; supersedesCaptureId: string | null }
  | { kind: 'certain'; ofCaptureId: string | null; ofTransactionId: string | null }
  | { kind: 'possible'; ofCaptureId: string | null; ofTransactionId: string | null }
  | { kind: 'reversal'; ofCaptureId: string; ofTransactionId: string | null };

const MINUTE = 60 * 1000;
const EXACT_REPEAT_WINDOW = 2 * MINUTE;
const UPDATE_WINDOW = 30 * MINUTE;
const CROSS_SOURCE_WINDOW = 10 * MINUTE;
const APPLE_PAY_WINDOW = 15 * MINUTE;
const MANUAL_WINDOW = 2 * 60 * MINUTE;
const RECURRING_WINDOW = 3 * 24 * 60 * MINUTE;

/** FNV-1a: a stable, dependency-free fingerprint of an alert's text. */
export function alertDedupeKey(
  channel: PaymentAlertChannel,
  sourceKey: string,
  normalizedLowerText: string,
): string {
  const input = `${channel}|${sourceKey}|${normalizedLowerText}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function timeOf(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function sameMoney(
  a: { amount: number | null; currency: string | null },
  b: { amount: number | null; currency: string | null },
): boolean {
  if (a.amount === null || b.amount === null) return false;
  const roundingTolerance = Number.EPSILON * Math.max(1, a.amount, b.amount) * 4;
  if (Math.abs(a.amount - b.amount) > roundingTolerance) return false;
  return !!a.currency && a.currency === b.currency;
}

const LIVE_STATUSES: ReadonlySet<PaymentAlertStatus> = new Set(['pending', 'logged']);

function normalizedName(text: string | null): string {
  return (text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function similarNames(a: string | null, b: string | null): boolean {
  const left = normalizedName(a);
  const right = normalizedName(b);
  if (!left || !right) return false;
  // Require the merchant itself, rather than a shared word such as "cafe".
  return left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `);
}

function sameAccount(a: { accountId: string | null }, b: { accountId: string | null }): boolean {
  return !!a.accountId && a.accountId === b.accountId;
}

/** Whether a stored date carries a time of day (the editor and alerts store full ISO). */
function hasTimeOfDay(date: string): boolean {
  return /T\d{2}:\d{2}/.test(date);
}

export function findDuplicate(
  incoming: IncomingCapture,
  recentCaptures: readonly CaptureRef[],
  recentTransactions: readonly TransactionRef[],
  transactionIdsFromCaptures: ReadonlySet<string>,
): DuplicateVerdict {
  const at = timeOf(incoming.capturedAt);
  const others = recentCaptures.filter((capture) => capture.id !== incoming.id);

  // 1. The very same alert again (a re-post, or the queue read twice).
  const repeat = others.find(
    (capture) =>
      LIVE_STATUSES.has(capture.status) &&
      capture.channel === incoming.channel &&
      capture.sourceKey === incoming.sourceKey &&
      sameAccount(capture, incoming) &&
      sameMoney(capture, incoming) &&
      capture.dedupeKey === incoming.dedupeKey &&
      (!capture.nativeKey || !incoming.nativeKey || capture.nativeKey === incoming.nativeKey) &&
      Math.abs(timeOf(capture.capturedAt) - at) <= EXACT_REPEAT_WINDOW,
  );
  if (repeat)
    return { kind: 'certain', ofCaptureId: repeat.id, ofTransactionId: repeat.transactionId };

  // 2. An update to a notification already seen.
  if (incoming.nativeKey) {
    const earlier = others
      .filter(
        (capture) =>
          capture.nativeKey === incoming.nativeKey &&
          capture.channel === incoming.channel &&
          capture.sourceKey === incoming.sourceKey &&
          sameAccount(capture, incoming) &&
          Math.abs(timeOf(capture.capturedAt) - at) <= UPDATE_WINDOW,
      )
      .sort((a, b) => timeOf(b.capturedAt) - timeOf(a.capturedAt))[0];
    if (earlier) {
      if (earlier.status === 'logged') {
        if (incoming.kind === 'declined' || incoming.kind === 'refund') {
          return {
            kind: 'reversal',
            ofCaptureId: earlier.id,
            ofTransactionId: earlier.transactionId,
          };
        }
        if (
          earlier.kind === incoming.kind &&
          sameMoney(earlier, incoming) &&
          (!earlier.counterparty ||
            !incoming.counterparty ||
            similarNames(earlier.counterparty, incoming.counterparty))
        ) {
          return {
            kind: 'certain',
            ofCaptureId: earlier.id,
            ofTransactionId: earlier.transactionId,
          };
        }
      } else if (earlier.status === 'pending') {
        return { kind: 'none', supersedesCaptureId: earlier.id };
      }
    }
  }

  // 3. The same payment announced by another source (bank app and wallet,
  //    or the Apple Pay automation and the bank).
  if (incoming.kind === 'spend' || incoming.kind === 'income' || incoming.kind === 'refund') {
    const twin = others.find((capture) => {
      if (!LIVE_STATUSES.has(capture.status)) return false;
      if (
        !sameAccount(capture, incoming) ||
        !similarNames(capture.counterparty, incoming.counterparty)
      )
        return false;
      if (capture.sourceKey === incoming.sourceKey && capture.channel === incoming.channel) {
        return false;
      }
      if (capture.kind && capture.kind !== incoming.kind) return false;
      const window =
        capture.channel === 'apple_pay' || incoming.channel === 'apple_pay'
          ? APPLE_PAY_WINDOW
          : CROSS_SOURCE_WINDOW;
      return Math.abs(timeOf(capture.capturedAt) - at) <= window && sameMoney(capture, incoming);
    });
    if (twin) return { kind: 'certain', ofCaptureId: twin.id, ofTransactionId: twin.transactionId };
  }

  // 4. The user already entered it, or a recurring rule did.
  if ((incoming.kind === 'spend' || incoming.kind === 'income') && incoming.amount !== null) {
    for (const transaction of recentTransactions) {
      if (transaction.type !== (incoming.kind === 'income' ? 'income' : 'expense')) continue;
      if (
        !sameAccount(transaction, incoming) ||
        !similarNames(transaction.note, incoming.counterparty)
      )
        continue;
      if (transactionIdsFromCaptures.has(transaction.id)) continue;
      if (!sameMoney(transaction, incoming)) {
        const recurringClose =
          transaction.currency === incoming.currency &&
          transaction.recurrenceParentId !== null &&
          Math.abs(transaction.amount - incoming.amount) <= Math.max(0.01, incoming.amount * 0.01);
        if (!recurringClose) continue;
      }
      const when = timeFromDateLocal(transaction.date);
      if (transaction.recurrenceParentId !== null) {
        if (
          Math.abs(when - at) <= RECURRING_WINDOW &&
          similarNames(transaction.note, incoming.counterparty)
        ) {
          return { kind: 'possible', ofCaptureId: null, ofTransactionId: transaction.id };
        }
        continue;
      }
      if (hasTimeOfDay(transaction.date)) {
        if (Math.abs(when - at) <= MANUAL_WINDOW) {
          return { kind: 'possible', ofCaptureId: null, ofTransactionId: transaction.id };
        }
        continue;
      }
      const sameDay = new Date(when).toDateString() === new Date(at).toDateString();
      if (sameDay && similarNames(transaction.note, incoming.counterparty)) {
        return { kind: 'possible', ofCaptureId: null, ofTransactionId: transaction.id };
      }
    }
  }

  return { kind: 'none', supersedesCaptureId: null };
}
