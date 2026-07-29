import type {
  PayerClaims,
  ReimbursementClaim,
  ReimbursementsSummary,
  ReimbursementStatus,
  Transaction,
  TransactionWithRelations,
} from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import {
  adjustAmountWithReporting,
  type AmountWithReporting,
  reportingValueOfSlice,
} from '~/utils/transactions';

/** Grouping key for claims that were never assigned a payer. */
export const UNASSIGNED_PAYER_KEY = '__unassigned__';

export interface AggregateClaimsOptions {
  /** The user's reporting currency; the roll-up total is expressed in it. */
  reportingCurrency: string;
  /**
   * Live fallback conversion: 1 unit of `currency` → the reporting currency, or
   * null when unknown. Only consulted when a transaction carries no usable
   * frozen fxRate snapshot; same-currency claims never call it.
   */
  rateToReporting?: (currency: string) => number | null;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Grouping key for a payer name: trimmed and case-folded, or the sentinel. */
export function payerKey(payer: string | null | undefined): string {
  const trimmed = payer?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.toLowerCase() : UNASSIGNED_PAYER_KEY;
}

/**
 * Whether an expense can have a claim attached at all: expenses only (like
 * splits), and there has to be something left to claim.
 */
export function isClaimable(
  transaction: Pick<Transaction, 'type' | 'amount' | 'reimbursementStatus'>,
): boolean {
  if (transaction.type !== 'expense') return false;
  if (transaction.reimbursementStatus === 'reimbursed') return false;
  return transaction.amount > 0;
}

/**
 * Largest claim a transaction can carry: never more than what is actually
 * still on the row, so clearing can't drive `amount` negative.
 */
export function clampClaimAmount(claim: number, transactionAmount: number): number {
  if (!Number.isFinite(claim) || claim <= 0) return 0;
  return normalizeMoneyAmount(Math.min(claim, normalizeMoneyAmount(transactionAmount)));
}

/** The live claim amount on a transaction, or 0 when there is no live claim. */
export function pendingClaimAmount(
  transaction: Pick<Transaction, 'reimbursementStatus' | 'reimbursementAmount'>,
): number {
  if (transaction.reimbursementStatus !== 'pending') return 0;
  const amount = transaction.reimbursementAmount ?? 0;
  return amount > 0 ? amount : 0;
}

/**
 * The amount pair to write when a pending claim is cleared: the claimed amount
 * comes off `amount`, and off the frozen reporting snapshot with it.
 *
 * A full claim lands on exactly 0, which is the point of the feature: the row
 * survives with all its metadata but stops counting as spending anywhere.
 */
export function applyReimbursement(
  transaction: Pick<
    Transaction,
    'amount' | 'reportingAmount' | 'fxRate' | 'reimbursementStatus' | 'reimbursementAmount'
  >,
): AmountWithReporting {
  const claim = clampClaimAmount(pendingClaimAmount(transaction), transaction.amount);
  return adjustAmountWithReporting(transaction, -claim);
}

/**
 * The inverse: put a cleared claim's amount back on the transaction. Undo must
 * restore the exact prior state, so this reads `reimbursementAmount` (which
 * clearing never touches) rather than recomputing anything.
 */
export function revertReimbursement(
  transaction: Pick<
    Transaction,
    'amount' | 'reportingAmount' | 'fxRate' | 'reimbursementStatus' | 'reimbursementAmount'
  >,
): AmountWithReporting {
  if (transaction.reimbursementStatus !== 'reimbursed') {
    return { amount: transaction.amount, reportingAmount: transaction.reportingAmount };
  }
  const claim = transaction.reimbursementAmount ?? 0;
  return adjustAmountWithReporting(transaction, claim > 0 ? claim : 0);
}

/**
 * The expense the claim was cut from, in the transaction's own currency: the
 * live amount while pending, the pre-reimbursement total once cleared. Keeping
 * this derivation in one place is what lets the UI show "$120" on a row whose
 * `amount` is now 0.
 */
export function grossAmountForClaim(
  transaction: Pick<Transaction, 'amount' | 'reimbursementStatus' | 'reimbursementAmount'>,
): number {
  if (transaction.reimbursementStatus !== 'reimbursed') return transaction.amount;
  return normalizeMoneyAmount(transaction.amount + (transaction.reimbursementAmount ?? 0));
}

function toClaim(
  tx: TransactionWithRelations,
  status: ReimbursementStatus,
  options: AggregateClaimsOptions,
): ReimbursementClaim | null {
  const amount = tx.reimbursementAmount ?? 0;
  if (!(amount > 0)) return null;
  const { reportingCurrency, rateToReporting } = options;
  return {
    transactionId: tx.id,
    status,
    payer: tx.reimbursementPayer?.trim() || null,
    date: tx.date,
    amount,
    currency: tx.currency,
    reportingAmount: roundCents(
      reportingValueOfSlice(amount, tx, reportingCurrency, rateToReporting),
    ),
    grossAmount: grossAmountForClaim(tx),
    note: tx.note ?? null,
    categoryName: tx.categoryName ?? null,
    categoryIcon: tx.categoryIcon ?? null,
    accountId: tx.accountId ?? null,
    claimedAt: tx.reimbursementClaimedAt ?? null,
    reimbursedAt: tx.reimbursedAt ?? null,
    reimbursementAccountId: tx.reimbursementAccountId ?? null,
  };
}

interface MutablePayer {
  key: string;
  name: string | null;
  /** Date of the claim the display name came from; most recent wins on casing drift. */
  nameDate: string;
  totalReporting: number;
  byCurrency: Map<string, number>;
  claims: ReimbursementClaim[];
  oldestDate: string;
}

function aggregateByPayer(
  transactions: TransactionWithRelations[],
  status: ReimbursementStatus,
  options: AggregateClaimsOptions,
): ReimbursementsSummary {
  const { reportingCurrency } = options;
  const payers = new Map<string, MutablePayer>();

  for (const tx of transactions) {
    if (tx.reimbursementStatus !== status) continue;
    const claim = toClaim(tx, status, options);
    if (!claim) continue;

    const key = payerKey(claim.payer);
    let payer = payers.get(key);
    if (!payer) {
      payer = {
        key,
        name: claim.payer,
        nameDate: tx.date,
        totalReporting: 0,
        byCurrency: new Map(),
        claims: [],
        oldestDate: tx.date,
      };
      payers.set(key, payer);
    }
    payer.claims.push(claim);
    payer.totalReporting = roundCents(payer.totalReporting + claim.reportingAmount);
    payer.byCurrency.set(
      tx.currency,
      roundCents((payer.byCurrency.get(tx.currency) ?? 0) + claim.amount),
    );
    if (tx.date < payer.oldestDate) payer.oldestDate = tx.date;
    // Casing drift ("acme" vs "Acme"): the most recent spelling wins.
    if (claim.payer && tx.date >= payer.nameDate) {
      payer.name = claim.payer;
      payer.nameDate = tx.date;
    }
  }

  const result: PayerClaims[] = [];
  let grandTotal = 0;
  let claimCount = 0;
  for (const payer of payers.values()) {
    // Newest claim first within a payer's group.
    payer.claims.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    result.push({
      key: payer.key,
      name: payer.name,
      totalReporting: payer.totalReporting,
      byCurrency: Array.from(payer.byCurrency.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount),
      claims: payer.claims,
      oldestDate: payer.oldestDate,
      claimCount: payer.claims.length,
    });
    grandTotal = roundCents(grandTotal + payer.totalReporting);
    claimCount += payer.claims.length;
  }

  // Most owed first; the unassigned bucket always sinks to the bottom on ties.
  result.sort((a, b) => {
    if (b.totalReporting !== a.totalReporting) return b.totalReporting - a.totalReporting;
    if (a.key === UNASSIGNED_PAYER_KEY) return 1;
    if (b.key === UNASSIGNED_PAYER_KEY) return -1;
    return 0;
  });

  return {
    payers: result,
    totalReporting: grandTotal,
    payerCount: result.length,
    claimCount,
    reportingCurrency,
  };
}

/** Everything the user is still waiting to be paid back for, grouped by payer. */
export function aggregatePendingClaimsByPayer(
  transactions: TransactionWithRelations[],
  options: AggregateClaimsOptions,
): ReimbursementsSummary {
  return aggregateByPayer(transactions, 'pending', options);
}

/** Already-cleared claims, same shape, for the history tab and undo. */
export function aggregateReimbursedClaimsByPayer(
  transactions: TransactionWithRelations[],
  options: AggregateClaimsOptions,
): ReimbursementsSummary {
  return aggregateByPayer(transactions, 'reimbursed', options);
}

/**
 * Cheap count of open claims. Mirrors {@link aggregatePendingClaimsByPayer}'s
 * filtering but skips the roll-up entirely: used by the always-mounted Settings
 * badge, so a transaction write anywhere in the app doesn't run the full
 * per-payer aggregation just to show a number, and to gate the free plan.
 */
export function countPendingClaims(transactions: TransactionWithRelations[]): number {
  let count = 0;
  for (const tx of transactions) {
    if (tx.reimbursementStatus !== 'pending') continue;
    if ((tx.reimbursementAmount ?? 0) > 0) count += 1;
  }
  return count;
}

/**
 * Payer names the user has used before, most recently used first, for the
 * claim sheet's autocomplete. Case-folded for dedupe but returned in the
 * spelling of the most recent use.
 */
export function recentPayerNames(transactions: TransactionWithRelations[], limit = 8): string[] {
  const seen = new Map<string, { name: string; date: string }>();
  for (const tx of transactions) {
    if (!tx.reimbursementStatus) continue;
    const name = tx.reimbursementPayer?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = seen.get(key);
    if (!existing || tx.date > existing.date) seen.set(key, { name, date: tx.date });
  }
  return Array.from(seen.values())
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((entry) => entry.name);
}
