import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration049TransactionReimbursements: DbMigration = {
  version: 49,
  name: '049_transaction_reimbursements',
  up(db) {
    // Reimbursement claim fields on transactions. Null status = not claimable,
    // which is every pre-existing row, so there is nothing to backfill.
    //
    // Columns rather than a side table because the relationship is 0..1 and the
    // pending badge is read on every transaction row render; a join table would
    // cost an attachSplits-style second query for every user of the app.
    //
    // reimbursement_amount is frozen in the transaction's own currency when the
    // claim is attached. Clearing subtracts it from `amount` (and from
    // `reporting_amount`), so the pre-reimbursement total is always
    // amount + reimbursement_amount.
    addColumnsIfMissing(db, 'transactions', [
      ['reimbursement_status', 'TEXT'],
      ['reimbursement_payer', 'TEXT'],
      ['reimbursement_amount', 'REAL'],
      ['reimbursement_claimed_at', 'TEXT'],
      ['reimbursed_at', 'TEXT'],
      ['reimbursement_account_id', 'TEXT'],
      ['reimbursement_transaction_id', 'TEXT'],
    ]);

    // Drives the pending list and the Settings badge count.
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_transactions_reimbursement_status
       ON transactions (reimbursement_status)
       WHERE reimbursement_status IS NOT NULL AND deleted_at IS NULL;`,
    );
  },
};

export default migration049TransactionReimbursements;
