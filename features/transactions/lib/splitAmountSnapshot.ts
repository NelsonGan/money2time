import { normalizeMoneyAmount } from '~/utils/formatters';

/**
 * The three amount fields a split payback has to move in lockstep: the entered
 * `amount` plus the two frozen currency snapshots derived from it.
 */
export interface SplitAdjustableAmounts {
  amount: number;
  reportingAmount: number | null;
  accountAmount: number | null;
}

/**
 * Re-scale a parent transaction's frozen currency snapshots when marking a
 * split paid (or unpaid) changes its `amount`.
 *
 * Marking a split paid shrinks the parent expense to the user's own share, but
 * `amount` is not the field the app aggregates on: every total (insights
 * breakdown, calendar day/month totals, budgets, cashflow) reads
 * `reportingAmount ?? amount`. Shrinking `amount` alone left the snapshot
 * pinned at the pre-split figure, so a 500,000 bill split in half kept
 * reporting 500,000 across every aggregation while the transaction row itself
 * showed 250,000.
 *
 * The snapshots are rescaled by the ratio rather than re-derived from the live
 * rate table: `reportingAmount`/`accountAmount` are frozen at write time on
 * purpose so historical aggregates never drift when FX rates move. Scaling
 * preserves the originally frozen rate exactly.
 */
export function rescaleSplitAdjustedAmounts(
  current: SplitAdjustableAmounts,
  nextAmount: number,
): SplitAdjustableAmounts {
  const amount = normalizeMoneyAmount(nextAmount);
  const previousAmount = current.amount;
  // A zero-amount parent offers no ratio to scale by. Leave the snapshots as
  // they are rather than invent a rate.
  if (previousAmount === 0) return { ...current, amount };
  const ratio = amount / previousAmount;
  return {
    amount,
    reportingAmount:
      current.reportingAmount === null
        ? null
        : normalizeMoneyAmount(current.reportingAmount * ratio),
    accountAmount:
      current.accountAmount === null ? null : normalizeMoneyAmount(current.accountAmount * ratio),
  };
}
