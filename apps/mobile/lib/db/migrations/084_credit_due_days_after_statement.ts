import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration084CreditDueDaysAfterStatement: DbMigration = {
  version: 84,
  name: '084_credit_due_days_after_statement',
  up(db) {
    // How many days after each statement a credit card's bill is due, for
    // banks that count the grace period in days rather than naming a day of
    // the month. Null (every existing card) keeps the fixed due day in
    // `credit_due_day`. A card that sets it still writes the day of the month
    // it lands on into `credit_due_day`, so older app versions, older backups
    // and older Web Dashboard pages keep showing a close due day.
    addColumnIfMissing(db, 'accounts', 'credit_due_days_after_statement', 'INTEGER');
  },
};

export default migration084CreditDueDaysAfterStatement;
