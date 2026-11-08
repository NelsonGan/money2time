import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration083HideAccountBalances: DbMigration = {
  version: 83,
  name: '083_hide_account_balances',
  up(db) {
    // Whether the Accounts and Goals pages mask balances (the eye on the
    // assets page). Off by default, so balances show until the user hides them.
    addColumnIfMissing(db, 'settings', 'hide_account_balances', 'INTEGER NOT NULL DEFAULT 0');
  },
};

export default migration083HideAccountBalances;
