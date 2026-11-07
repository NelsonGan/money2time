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
 * Rates for one unit of a bill's currency, used only when its amount is 0 and
 * the snapshots cannot be rescaled: `reportingRate` into the reporting
 * currency (the bill's frozen `fxRate`) and `accountRate` into its account's.
 */
export interface SplitSnapshotRates {
  reportingRate: number | null;
  accountRate: number | null;
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
  rates?: () => SplitSnapshotRates,
): SplitAdjustableAmounts {
  const amount = normalizeMoneyAmount(nextAmount);
  const previousAmount = current.amount;
  if (previousAmount === 0) {
    // A zero-amount parent offers no ratio to scale by: a bill whose friends
    // paid back every share (the user's own being 0) sits at 0 with its
    // snapshots at 0 too. Undoing a payment then has to rebuild them from a
    // rate, or totals and the account balance would count the bill as 0.
    // Without a rate, leave them as they are rather than invent one.
    if (amount === 0 || !rates) return { ...current, amount };
    const { reportingRate, accountRate } = rates();
    return {
      amount,
      reportingAmount:
        current.reportingAmount === null || reportingRate == null
          ? current.reportingAmount
          : normalizeMoneyAmount(amount * reportingRate),
      accountAmount:
        current.accountAmount === null || accountRate == null
          ? current.accountAmount
          : normalizeMoneyAmount(amount * accountRate),
    };
  }
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
