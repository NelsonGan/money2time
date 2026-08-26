import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration058LoanCountAsExpense: DbMigration = {
  version: 58,
  name: '058_loan_count_as_expense',
  up(db) {
    // "Count instalment as expense" on a loan.
    //
    // A repayment stays an ordinary transfer, because that is what makes the
    // debt fall and keeps net worth right (cash and liability drop together).
    // The borrower still feels it as spending, so the loan carries a toggle
    // and a category, and every repayment written while the toggle is on is
    // stamped `counts_as_expense`. The spending readouts (cashflow, category
    // breakdown, budgets, calendar, review, widgets) read that stamp; account
    // balances and asset history never do, exactly as with reimbursements.
    //
    // Stamped per row rather than derived from the account, so flipping the
    // toggle later cannot silently rewrite months of totals the user has
    // already read, and so an analytics site never needs an accounts lookup.
    addColumnsIfMissing(db, 'accounts', [
      // 1/0 on loans, null everywhere else. Null on a loan means the account
      // predates this migration, and is deliberately NOT backfilled to the
      // new-loan default: that would start counting an existing borrower's
      // repayments as spending without them asking, and their auto-repayment
      // rule (written before the column existed) would disagree with it. It
      // reads as off until they open the loan and turn it on.
      ['loan_count_as_expense', 'INTEGER'],
      ['loan_payment_category_id', 'TEXT'],
    ]);

    // The auto-repayment rule carries the intent so the engine can stamp the
    // rows it generates without reading the account back.
    addColumnsIfMissing(db, 'recurring_rules', [
      ['counts_as_expense', 'INTEGER NOT NULL DEFAULT 0'],
    ]);

    // Default 0: every existing transfer keeps counting exactly as it does
    // today, so nobody's historical totals move on upgrade.
    addColumnsIfMissing(db, 'transactions', [['counts_as_expense', 'INTEGER NOT NULL DEFAULT 0']]);
  },
};

export default migration058LoanCountAsExpense;
