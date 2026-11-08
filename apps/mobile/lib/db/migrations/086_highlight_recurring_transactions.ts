import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration086HighlightRecurringTransactions: DbMigration = {
  version: 86,
  name: '086_highlight_recurring_transactions',
  up(db) {
    // Whether entries a recurring rule made get a tinted background in the
    // transaction lists (Recurring > settings). Off by default.
    addColumnIfMissing(
      db,
      'settings',
      'highlight_recurring_transactions',
      'INTEGER NOT NULL DEFAULT 0',
    );
  },
};

export default migration086HighlightRecurringTransactions;
