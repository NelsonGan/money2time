import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration053AccountLoanTerm: DbMigration = {
  version: 53,
  name: '053_account_loan_term',
  up(db) {
    // The loan contract's shape. A borrower knows the amount, the rate and the
    // term; the monthly instalment is the output, so it is derived from these
    // and stored in loan_monthly_payment rather than typed in. The start date
    // also fixes loan_payment_day (its day of month) and the payoff date.
    addColumnsIfMissing(db, 'accounts', [
      ['loan_term_months', 'INTEGER'],
      ['loan_start_date', 'TEXT'],
    ]);
  },
};

export default migration053AccountLoanTerm;
