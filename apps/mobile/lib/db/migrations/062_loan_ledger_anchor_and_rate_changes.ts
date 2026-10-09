import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration062LoanLedgerAnchorAndRateChanges: DbMigration = {
  version: 62,
  name: '062_loan_ledger_anchor_and_rate_changes',
  up(db) {
    // Two columns for walking a loan's interest forward faithfully.
    //
    // `loan_ledger_anchor_date` is the day the starting balance describes. A
    // loan set up part-way through its life opens at the balance left after
    // the instalments already paid, which is the balance as of the *last* of
    // those instalments, not as of the day the account was created. Anchoring
    // the monthly interest rests there puts every later rest on the payment
    // day, as the lender's are. Left null on existing loans, which keep
    // anchoring on their creation day exactly as they did.
    //
    // `loan_rate_changes_json` records the rate changes a variable (reducing
    // balance) loan has been through, oldest first, so a new rate applies from
    // the day it was recorded and the interest already charged stands. Null
    // means one rate for the whole life so far.
    addColumnsIfMissing(db, 'accounts', [
      ['loan_ledger_anchor_date', 'TEXT'],
      ['loan_rate_changes_json', 'TEXT'],
    ]);
  },
};

export default migration062LoanLedgerAnchorAndRateChanges;
