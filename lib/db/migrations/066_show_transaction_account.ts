import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration066ShowTransactionAccount: DbMigration = {
  version: 66,
  name: '066_show_transaction_account',
  up(db) {
    // Whether transaction rows show which account they were paid from or into.
    // On by default, so every existing install keeps the rows it already has.
    addColumnIfMissing(db, 'settings', 'show_transaction_account', 'INTEGER NOT NULL DEFAULT 1');
  },
};

export default migration066ShowTransactionAccount;
