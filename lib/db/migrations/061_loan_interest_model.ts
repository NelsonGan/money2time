import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration061LoanInterestModel: DbMigration = {
  version: 61,
  name: '061_loan_interest_model',
  up(db) {
    // How the loan's interest is worked out: 'flat' or 'reducing'.
    //
    // Everything the app modelled before this was a flat contract: the cost of
    // the loan was fixed at signing, so what is owed fell by exactly what was
    // paid and an extra repayment bought only an earlier finish. A reducing
    // balance loan (every Malaysian house loan, and mortgages generally)
    // charges interest each month on what is still owed, so the same extra
    // repayment stops that money accruing interest for the rest of the term.
    //
    // Deliberately left null on every existing loan rather than backfilled to
    // 'flat'. The two are read through the same helper, which treats null as
    // flat, so an upgraded loan reads exactly as it did before; backfilling
    // would only make a restored older backup disagree with a fresh install.
    addColumnsIfMissing(db, 'accounts', [['loan_interest_model', 'TEXT']]);
  },
};

export default migration061LoanInterestModel;
