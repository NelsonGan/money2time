import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration052AccountLoanFields: DbMigration = {
  version: 52,
  name: '052_account_loan_fields',
  up(db) {
    // Loan fields on accounts (type = 'loan'). Null on every non-loan account.
    //
    // The first four describe the contract as a borrower knows it: amount,
    // rate, term, and when it started. The monthly instalment is the output of
    // those, so it is derived rather than typed in, and the start date's day of
    // month fixes loan_payment_day. `starting_balance` carries what was owed
    // when tracking started, so loan_original_principal is what makes a
    // mid-loan signup show truthful progress.
    //
    // loan_paid_off_at gates the one-shot payoff celebration (and is cleared on
    // a redraw), never the displayed state; loan_archived_at hides a settled
    // loan from the accounts stack and pickers without deleting its history.
    addColumnsIfMissing(db, 'accounts', [
      ['loan_original_principal', 'REAL'],
      ['loan_interest_rate', 'REAL'],
      ['loan_term_months', 'INTEGER'],
      ['loan_start_date', 'TEXT'],
      ['loan_monthly_payment', 'REAL'],
      ['loan_payment_day', 'INTEGER'],
      ['loan_paid_off_at', 'TEXT'],
      ['loan_archived_at', 'TEXT'],
    ]);
  },
};

export default migration052AccountLoanFields;
