import type { DbMigration } from './types';

export const migration048TransactionsSplitMethod: DbMigration = {
  version: 48,
  name: '048_transactions_split_method',
  up(db) {
    // How a split bill divides ('even' | 'custom' | 'items'), frozen at creation
    // so re-opening a saved bill restores the exact tab and can lock it. Null for
    // non-split transactions and legacy rows (those fall back to inference).
    db.execSync(`ALTER TABLE transactions ADD COLUMN split_method TEXT;`);
  },
};

export default migration048TransactionsSplitMethod;
