import type { ClaimStatus, Transaction } from '~/types';

import { normalizeMoneyAmount } from './formatters';

// Money amounts are normalized to 2 decimals, so a sub-cent epsilon safely
// absorbs float noise when comparing a running reimbursed sum to the claim.
const CLAIM_EPSILON = 0.005;

/**
 * Derive a claimable expense's status from how much of its claim has been
 * reimbursed. `submitted` is a V2 grouping state that survives partial rewinds;
 * V1 callers pass `wasSubmitted = false`.
 */
export function claimStatusForReimbursedAmount(
  claimAmount: number,
  reimbursedAmount: number,
  wasSubmitted = false,
): ClaimStatus {
  if (claimAmount <= 0) return 'none';
  if (reimbursedAmount <= CLAIM_EPSILON) return wasSubmitted ? 'submitted' : 'claimable';
  if (reimbursedAmount >= claimAmount - CLAIM_EPSILON) return 'reimbursed';
  return 'partially_reimbursed';
}

/** True once the claim is fully settled. */
export function isFullyReimbursed(claimAmount: number, reimbursedAmount: number): boolean {
  return claimAmount > 0 && reimbursedAmount >= claimAmount - CLAIM_EPSILON;
}

/** Remaining amount still owed on a claimable expense (never negative). */
export function outstandingClaimAmount(
  tx: Pick<Transaction, 'claimStatus' | 'claimAmount' | 'reimbursedAmount'>,
): number {
  if (tx.claimStatus === 'none' || tx.claimAmount == null) return 0;
  return Math.max(0, normalizeMoneyAmount(tx.claimAmount - (tx.reimbursedAmount ?? 0)));
}

/** A claimable expense that still has money owed. */
export function isOutstandingClaim(
  tx: Pick<Transaction, 'claimStatus' | 'claimAmount' | 'reimbursedAmount'>,
): boolean {
  return (
    tx.claimStatus === 'claimable' ||
    tx.claimStatus === 'submitted' ||
    tx.claimStatus === 'partially_reimbursed'
  );
}

/** True for reimbursement-inflow rows (income created to settle a claim). */
export function isReimbursementInflow(tx: Pick<Transaction, 'reimbursesTransactionId'>): boolean {
  return !!tx.reimbursesTransactionId;
}

/**
 * Resolve the claim amount for a newly-flagged expense: defaults to the full
 * expense amount, and is clamped to `(0, amount]` for partial claims.
 */
export function clampClaimAmount(requested: number | null | undefined, amount: number): number {
  const max = normalizeMoneyAmount(amount);
  if (requested == null) return max;
  const normalized = normalizeMoneyAmount(requested);
  if (normalized <= 0) return max;
  return Math.min(normalized, max);
}

/**
 * Clamp a settlement amount so the running reimbursed total never exceeds the
 * claim. Returns the amount that can actually be applied.
 */
export function clampReimbursementAmount(
  requested: number,
  claimAmount: number,
  alreadyReimbursed: number,
): number {
  const remaining = Math.max(0, claimAmount - alreadyReimbursed);
  return normalizeMoneyAmount(Math.min(Math.max(0, requested), remaining));
}
