import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration080AccountArchivedAt: DbMigration = {
  version: 80,
  name: '080_account_archived_at',
  up(db) {
    // Null = a live account. Set when the user archives an everyday (debit or
    // credit) account: it leaves the accounts stack and the account pickers,
    // and keeps every transaction. Loans and goals keep their own archive
    // stamps (loan_archived_at, goal_archived_at), which older app versions
    // and the Web Dashboard already read; read all three through
    // `isAccountArchived`.
    addColumnIfMissing(db, 'accounts', 'archived_at', 'TEXT');
  },
};

export default migration080AccountArchivedAt;
