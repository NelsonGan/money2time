import type { DbMigration } from './types';

// Claim / reimbursement (V1). Adds per-transaction claim state so an expense can
// be flagged as claimable, tracked while outstanding, and settled when the money
// comes back.
//
// - claim_status: filterable lifecycle — 'none' | 'claimable' | 'submitted' |
//   'partially_reimbursed' | 'reimbursed'. Existing rows default to 'none'.
// - claim_amount: amount expected back (tx currency); null when not claimable.
// - reimbursed_amount: denormalized running sum of settled reimbursement inflows.
// - reimbursed_at: ISO ts when fully settled.
// - reimbursement_account_id: preferred settle-into account.
// - reimburses_transaction_id: back-pointer set ONLY on reimbursement-inflow
//   (income) rows -> the claimable expense they settle. A non-null value marks a
//   row as a reimbursement, so income aggregates exclude it, and supports one
//   expense -> many settlement inflows (partial tranches).
//
// The two partial indexes back the "what's still outstanding" scan and the
// reverse lookup (expense -> its reimbursement inflows).
const SQL = `
  ALTER TABLE transactions ADD COLUMN claim_status TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE transactions ADD COLUMN claim_amount REAL;
  ALTER TABLE transactions ADD COLUMN reimbursed_amount REAL NOT NULL DEFAULT 0;
  ALTER TABLE transactions ADD COLUMN reimbursed_at TEXT;
  ALTER TABLE transactions ADD COLUMN reimbursement_account_id TEXT;
  ALTER TABLE transactions ADD COLUMN reimburses_transaction_id TEXT;

  CREATE INDEX IF NOT EXISTS idx_transactions_claim_outstanding
    ON transactions (claim_status)
    WHERE deleted_at IS NULL
      AND claim_status IN ('claimable', 'submitted', 'partially_reimbursed');

  CREATE INDEX IF NOT EXISTS idx_transactions_reimburses
    ON transactions (reimburses_transaction_id)
    WHERE deleted_at IS NULL AND reimburses_transaction_id IS NOT NULL;
`;

export const migration043ClaimableExpenses: DbMigration = {
  version: 43,
  name: '043_claimable_expenses',
  up(db) {
    db.execSync(SQL);
  },
};

export default migration043ClaimableExpenses;
