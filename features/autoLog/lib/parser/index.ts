// Payment-alert parser: one bank or wallet app alert in, what it says about
// money out. Pure and synchronous; covered by
// __tests__/features/autoLog/parser.test.ts against the fixture corpus in
// __tests__/fixtures/payment-alerts.
//
// The parser only reads text. Which account, which category and whether to
// log it are decided later (binding.ts, categorize.ts, decide.ts), so this
// stays testable without any user data.

import type { PaymentAlertConfidence, PaymentAlertKind, PaymentAlertParse } from '~/types';

import { findMoneyCandidates, type MoneyCandidate } from './amounts';
import { extractCounterparty } from './counterparty';
import {
  AUTH_HOLD,
  BALANCE,
  COMPLETION,
  DECLINED,
  FUTURE,
  INCOME,
  NOT_THE_PAYMENT_BEFORE,
  OTP,
  P2P,
  PROMO,
  REFUND,
  SPEND_STRONG,
  SPEND_WEAK,
  TRANSFER,
} from './lexicons';
import {
  compileLexicon,
  containsWords,
  findLexiconHits,
  type LexiconHit,
  normalizeAlertText,
  type NormalizedAlert,
} from './text';

/** Bump when the parser's output for the same text changes; pending alerts re-parse. */
export const ALERT_PARSER_VERSION = 2;

const LEX = {
  otp: compileLexicon(OTP),
  declined: compileLexicon(DECLINED),
  future: compileLexicon(FUTURE),
  refund: compileLexicon(REFUND),
  income: compileLexicon(INCOME),
  transfer: compileLexicon(TRANSFER),
  spendStrong: compileLexicon(SPEND_STRONG),
  spendWeak: compileLexicon(SPEND_WEAK),
  completion: compileLexicon(COMPLETION),
  p2p: compileLexicon(P2P),
  promo: compileLexicon(PROMO),
  balance: compileLexicon(BALANCE),
  authHold: compileLexicon(AUTH_HOLD),
};

export interface AlertTextParts {
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  extra?: readonly (string | null | undefined)[];
}

interface Hits {
  otp: LexiconHit[];
  declined: LexiconHit[];
  future: LexiconHit[];
  refund: LexiconHit[];
  income: LexiconHit[];
  transfer: LexiconHit[];
  spendStrong: LexiconHit[];
  spendWeak: LexiconHit[];
  completion: LexiconHit[];
  p2p: LexiconHit[];
  promo: LexiconHit[];
  balance: LexiconHit[];
  authHold: LexiconHit[];
}

function collectHits(lower: string): Hits {
  return {
    otp: findLexiconHits(lower, LEX.otp),
    declined: findLexiconHits(lower, LEX.declined),
    future: findLexiconHits(lower, LEX.future),
    refund: findLexiconHits(lower, LEX.refund),
    income: findLexiconHits(lower, LEX.income),
    transfer: findLexiconHits(lower, LEX.transfer),
    spendStrong: findLexiconHits(lower, LEX.spendStrong),
    spendWeak: findLexiconHits(lower, LEX.spendWeak),
    completion: findLexiconHits(lower, LEX.completion),
    p2p: findLexiconHits(lower, LEX.p2p),
    promo: findLexiconHits(lower, LEX.promo),
    balance: findLexiconHits(lower, LEX.balance),
    authHold: findLexiconHits(lower, LEX.authHold),
  };
}

interface Classification {
  kind: PaymentAlertKind;
  /** Spend described in past tense, or a payment noun plus a completion word. */
  strongSpend: boolean;
  signals: string[];
}

/**
 * Decide what the alert is about. Order matters: a code, a decline or a
 * future debit overrides any spend wording in the same alert, and money coming
 * in is checked before money going out because "sent you" contains "sent".
 */
function classify(hits: Hits, lower: string): Classification {
  const signals: string[] = [];
  // A completion word next to "at <merchant>" is a card authorization even
  // without a verb: "USD 12.00 at AMAZON.COM was approved".
  const strongSpend =
    hits.spendStrong.length > 0 ||
    (hits.spendWeak.length > 0 && hits.completion.length > 0) ||
    (hits.completion.length > 0 && hasNearbyMerchantLeadIn(lower));

  if (hits.otp.length > 0) return { kind: 'otp', strongSpend, signals: ['otp'] };
  if (hits.declined.length > 0) return { kind: 'declined', strongSpend, signals: ['declined'] };
  if (hits.future.length > 0) {
    return { kind: 'balance', strongSpend, signals: [`future:${hits.future[0]?.word ?? ''}`] };
  }
  if (hits.refund.length > 0) return { kind: 'refund', strongSpend, signals: ['refund'] };
  if (hits.income.length > 0) {
    return { kind: 'income', strongSpend, signals: [`income:${hits.income[0]?.word ?? ''}`] };
  }
  if (hits.transfer.length > 0) {
    return { kind: 'transfer', strongSpend, signals: [`transfer:${hits.transfer[0]?.word ?? ''}`] };
  }
  if (strongSpend) {
    const verb =
      hits.spendStrong[0]?.word ??
      (hits.spendWeak[0]
        ? `${hits.spendWeak[0].word}+done`
        : `at+${hits.completion[0]?.word ?? ''}`);
    signals.push(`verb:${verb}`);
    return { kind: 'spend', strongSpend, signals };
  }
  if (hits.promo.length > 0) return { kind: 'promo', strongSpend, signals: ['promo'] };
  if (hits.spendWeak.length > 0) {
    return { kind: 'spend', strongSpend, signals: [`weak_verb:${hits.spendWeak[0]?.word ?? ''}`] };
  }
  if (hits.balance.length > 0) return { kind: 'balance', strongSpend, signals: ['balance'] };
  return { kind: 'unknown', strongSpend, signals: ['no_verb'] };
}

const NOT_THE_PAYMENT_WINDOW = 28;
const VERB_NEAR = 30;
const VERB_FAR = 70;

interface ScoredCandidate {
  candidate: MoneyCandidate;
  score: number;
  notThePayment: boolean;
}

function scoreCandidates(
  alert: NormalizedAlert,
  candidates: readonly MoneyCandidate[],
  verbPositions: readonly number[],
): ScoredCandidate[] {
  return candidates.map((candidate, index) => {
    let score = 0;
    if (candidate.via === 'iso' || candidate.via === 'symbol') score += 2;
    else if (candidate.via === 'ambiguous_symbol') score += 1.5;
    else if (candidate.via === 'label') score += 1;

    const distance = verbPositions.reduce((best, position) => {
      const gap =
        position >= candidate.end
          ? position - candidate.end
          : candidate.start >= position
            ? candidate.start - position
            : 0;
      return Math.min(best, gap);
    }, Number.POSITIVE_INFINITY);
    if (distance <= VERB_NEAR) score += 4;
    else if (distance <= VERB_FAR) score += 2;

    const after = alert.lower.slice(candidate.end, candidate.end + 8);
    if (/^\s*(?:at|@|to|di|kepada|ke|for)\b/.test(after)) score += 2;

    const before = alert.lower.slice(
      Math.max(0, candidate.start - NOT_THE_PAYMENT_WINDOW),
      candidate.start,
    );
    // A balance in the preceding sentence does not qualify the next amount.
    const localBefore = before.split(/\n|[.;,]\s/).pop() ?? before;
    const notThePayment = NOT_THE_PAYMENT_BEFORE.some((word) => containsWords(localBefore, word));
    if (notThePayment) score -= 6;

    // An amount in brackets right after another one is its conversion.
    const previous = candidates[index - 1];
    if (previous && /^\s*\(?\s*$/.test(alert.text.slice(previous.end, candidate.start))) {
      if (alert.text.slice(previous.end, candidate.start).includes('(')) score -= 3;
    }

    return { candidate, score, notThePayment };
  });
}

function pickPrimary(scored: readonly ScoredCandidate[]): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;
  for (const entry of scored) {
    if (!best || entry.score > best.score) best = entry;
  }
  return best;
}

/** Another explicitly-currencied amount near the payment, e.g. `USD 12.00 (RM 56.30)`. */
function pickSecondary(
  primary: ScoredCandidate,
  scored: readonly ScoredCandidate[],
): { amount: number; currency: string } | null {
  if (!primary.candidate.currency) return null;
  for (const entry of scored) {
    if (entry === primary || entry.notThePayment) continue;
    const { candidate } = entry;
    if (!candidate.currency || candidate.currency === primary.candidate.currency) continue;
    const gap =
      candidate.start >= primary.candidate.end
        ? candidate.start - primary.candidate.end
        : primary.candidate.start - candidate.end;
    if (gap <= 24) return { amount: candidate.amount, currency: candidate.currency };
  }
  return null;
}

function hasNearbyMerchantLeadIn(lower: string): boolean {
  return /(?:^|\s)(?:at|@)\s|merchant\s*:/.test(lower);
}

function confidenceFor(
  kind: PaymentAlertKind,
  primary: ScoredCandidate | null,
  scored: readonly ScoredCandidate[],
  classification: Classification,
  flags: { p2pOnly: boolean; authHold: boolean },
): PaymentAlertConfidence {
  if (!primary) return 'low';
  if (kind !== 'spend') return 'medium';
  const competing = scored.some(
    (entry) =>
      entry !== primary &&
      !entry.notThePayment &&
      entry.candidate.currency === primary.candidate.currency &&
      Math.abs(entry.candidate.amount - primary.candidate.amount) > 0.001 &&
      primary.score - entry.score < 2,
  );
  if (
    classification.strongSpend &&
    primary.score >= 5 &&
    !competing &&
    !flags.p2pOnly &&
    !flags.authHold &&
    (primary.candidate.via === 'iso' ||
      primary.candidate.via === 'symbol' ||
      primary.candidate.via === 'ambiguous_symbol')
  ) {
    return 'high';
  }
  if (primary.score >= 2) return 'medium';
  return 'low';
}

/** Parse one alert. Never throws; unusable text comes back as `unknown` with no amount. */
export function parsePaymentAlert(parts: AlertTextParts): PaymentAlertParse {
  const alert = normalizeAlertText([
    parts.title,
    parts.subtitle,
    parts.body,
    ...(parts.extra ?? []),
  ]);
  const hits = collectHits(alert.lower);
  const classification = classify(hits, alert.lower);
  const signals = [...classification.signals];

  const candidates = findMoneyCandidates(alert.text);
  const verbPositions = [
    ...hits.spendStrong,
    ...hits.spendWeak,
    ...hits.income,
    ...hits.refund,
    ...hits.transfer,
  ].map((hit) => hit.index);
  const scored = scoreCandidates(alert, candidates, verbPositions);
  const primary = pickPrimary(
    classification.kind === 'spend' ? scored.filter((entry) => !entry.notThePayment) : scored,
  );
  scored
    .filter((entry) => entry.notThePayment)
    .forEach((entry) =>
      signals.push(`skipped:${entry.candidate.token ?? ''}${entry.candidate.amount}`),
    );

  let kind = classification.kind;
  if (
    !primary &&
    (kind === 'spend' || kind === 'income' || kind === 'refund' || kind === 'transfer')
  ) {
    signals.push('no_amount');
    kind = 'unknown';
  }

  const direction = kind === 'income' || kind === 'refund' ? 'in' : 'out';
  const counterparty = primary
    ? extractCounterparty(alert.text, alert.lower, {
        direction,
        amountEnd: primary.candidate.end,
      })
    : null;

  const p2pOnly = kind === 'spend' && hits.p2p.length > 0 && !hasNearbyMerchantLeadIn(alert.lower);
  if (p2pOnly) signals.push('p2p');
  const authHold = hits.authHold.length > 0;
  if (authHold) signals.push('auth_hold');

  const confidence = confidenceFor(kind, primary, scored, classification, { p2pOnly, authHold });
  if (primary) {
    signals.push(`amount:${primary.candidate.token ?? ''}${primary.candidate.amount}`);
  }

  return {
    kind,
    amount: primary ? primary.candidate.amount : null,
    currency: primary?.candidate.currency ?? null,
    currencyToken: primary?.candidate.token ?? null,
    secondary: primary ? pickSecondary(primary, scored) : null,
    counterparty: counterparty?.name ?? null,
    counterpartyLeadIn: counterparty?.leadIn ?? null,
    confidence,
    signals,
    parserVersion: ALERT_PARSER_VERSION,
  };
}

/** The normalized text the parser saw, for duplicate and ignore-phrase matching. */
export function normalizedAlertLower(parts: AlertTextParts): string {
  return normalizeAlertText([parts.title, parts.subtitle, parts.body, ...(parts.extra ?? [])])
    .lower;
}
