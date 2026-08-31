import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration059LoanTotalRepayable: DbMigration = {
  version: 59,
  name: '059_loan_total_repayable',
  up(db) {
    // What the loan costs, kept apart from what is paid each month.
    //
    // Until now the total was derived as instalment x term, which forced the
    // two to agree. Real agreements do not: a lender rounds the instalment up
    // and lets a smaller final payment absorb the difference, so a contract
    // repaying 64,831.90 over 108 months charges 601 rather than 600.29. Deriving
    // one from the other loses whichever the borrower did not type, and the
    // gap is real money in the interest figure and the payoff projection.
    //
    // Null on every existing loan, and deliberately not backfilled: the old
    // instalment x term is exactly what the editor falls back to when this is
    // null, so an upgraded loan reads precisely as it did before and only
    // moves when its owner opens it and types the total from their agreement.
    addColumnsIfMissing(db, 'accounts', [['loan_total_repayable', 'REAL']]);
  },
};

export default migration059LoanTotalRepayable;
