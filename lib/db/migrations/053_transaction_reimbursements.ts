import { addColumnIfMissing, addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration053TransactionReimbursements: DbMigration = {
  version: 53,
  name: '053_transaction_reimbursements',
  up(db) {
    // Reimbursements: an expense someone else is going to pay back.
    //
    // `reimbursable` is the tick the user puts on the expense. When the money
    // actually arrives they mark it reimbursed, which stamps `reimbursed_at`,
    // records which account it landed in, and writes an income row for the
    // refund so balances stay truthful.
    //
    // The two id columns are the same forward/back pair transaction_splits uses
    // for paybacks: the expense points at its refund row, and the refund row
    // points back at the expense. The back-pointer is what lets the spending
    // filter recognise a refund row without a lookup, so an expense and its
    // refund always drop out of the totals together and never leave income
    // inflated against expense.
    addColumnsIfMissing(db, 'transactions', [
      ['reimbursable', 'INTEGER NOT NULL DEFAULT 0'],
      ['reimbursed_at', 'TEXT'],
      ['reimbursement_account_id', 'TEXT'],
      ['reimbursement_transaction_id', 'TEXT'],
      ['reimbursement_of_id', 'TEXT'],
    ]);

    // Whether a reimbursable expense still counts as spending. Default on, so
    // nobody's existing totals move when they upgrade into this feature.
    addColumnIfMissing(
      db,
      'settings',
      'reimbursements_count_as_expense',
      'INTEGER NOT NULL DEFAULT 1',
    );
  },
};

export default migration053TransactionReimbursements;
