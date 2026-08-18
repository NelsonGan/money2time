import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration052AccountLoanFields: DbMigration = {
  version: 52,
  name: '052_account_loan_fields',
  up(db) {
    // Loan fields on accounts (type = 'loan'). Null on every non-loan account.
    // `starting_balance` carries what was owed when tracking started, so
    // `loan_original_principal` is what makes a mid-loan signup show truthful
    // progress. loan_paid_off_at is a persisted one-shot stamp so the payoff
    // celebration fires exactly once; loan_archived_at hides a settled loan
    // from the accounts stack and pickers without deleting its history.
    addColumnsIfMissing(db, 'accounts', [
      ['loan_original_principal', 'REAL'],
      ['loan_monthly_payment', 'REAL'],
      ['loan_payment_day', 'INTEGER'],
      ['loan_interest_rate', 'REAL'],
      ['loan_end_date', 'TEXT'],
      ['loan_paid_off_at', 'TEXT'],
      ['loan_archived_at', 'TEXT'],
    ]);
  },
};

export default migration052AccountLoanFields;
