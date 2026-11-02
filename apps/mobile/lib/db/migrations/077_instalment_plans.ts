import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

// Instalment plans: a purchase paid off in parts (a phone on a 12-month card
// plan, a sofa on buy now pay later in 3).
// - recurring_rules: a plan is a recurring rule with these set, and an
//   ordinary rule leaves them null. instalment_count is the number of
//   payments, instalment_total what they add up to, and instalment_start_date
//   the first payment's date, which every later date is counted from.
// - transactions: each payment row names its plan and which payment it is
//   (0 for the one that paid off everything left). Kept explicit rather than
//   read from the run id, because a ledger copy gives every row a new id.
// All nullable, so every existing row reads as before.
export const migration077InstalmentPlans: DbMigration = {
  version: 77,
  name: '077_instalment_plans',
  up(db) {
    addColumnsIfMissing(db, 'recurring_rules', [
      ['instalment_count', 'INTEGER'],
      ['instalment_total', 'REAL'],
      ['instalment_start_date', 'TEXT'],
    ]);
    addColumnsIfMissing(db, 'transactions', [
      ['instalment_rule_id', 'TEXT'],
      ['instalment_number', 'INTEGER'],
    ]);
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_instalment_rule
        ON transactions(instalment_rule_id)
        WHERE instalment_rule_id IS NOT NULL;
    `);
  },
};

export default migration077InstalmentPlans;
