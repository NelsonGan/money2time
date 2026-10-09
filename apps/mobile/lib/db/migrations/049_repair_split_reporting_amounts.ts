import type { DbMigration } from './types';

export const migration049RepairSplitReportingAmounts: DbMigration = {
  version: 49,
  name: '049_repair_split_reporting_amounts',
  up(db) {
    // Data-only repair, no schema change.
    //
    // Marking a split bill paid used to shrink transactions.amount to the
    // user's own share while leaving the frozen reporting_amount snapshot at
    // the full pre-split total. Since every aggregation in the app reads
    // `reporting_amount ?? amount`, a 500,000 bill split in half kept being
    // counted as 500,000 in the insights breakdown, calendar totals, budgets
    // and cashflow, even though the transaction row itself showed 250,000.
    //
    // AppContext now rescales the snapshot alongside the amount, but rows
    // written before this build are already skewed. The snapshot is defined as
    // `reporting_amount = amount * fx_rate` at write time, so any live
    // income/expense row that no longer satisfies that identity is skewed and
    // can be recomputed exactly from its own frozen rate. Re-deriving from the
    // stored fx_rate (never from the live rate table) keeps historical totals
    // pinned to the rate captured when the transaction was written.
    //
    // The 0.01 tolerance keeps ordinary cent-rounding from being rewritten.
    // The statement is naturally idempotent: once a row satisfies the identity
    // the WHERE clause no longer selects it, so a replay after a failed batch
    // is a no-op.
    db.execSync(`
      UPDATE transactions
      SET reporting_amount = ROUND(amount * fx_rate, 2)
      WHERE deleted_at IS NULL
        AND type IN ('expense', 'income')
        AND fx_rate IS NOT NULL
        AND fx_rate > 0
        AND reporting_amount IS NOT NULL
        AND ABS(reporting_amount - (amount * fx_rate)) > 0.01
    `);
  },
};

export default migration049RepairSplitReportingAmounts;
