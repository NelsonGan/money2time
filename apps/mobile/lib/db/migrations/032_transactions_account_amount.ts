import type { DbMigration } from './types';

export const migration032TransactionsAccountAmount: DbMigration = {
  version: 32,
  name: '032_transactions_account_amount',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(transactions);');
    const existing = new Set(columns.map((c) => c.name));

    // Frozen value of the transaction in its account's currency, captured at
    // write time when the entered currency differs from the account currency
    // (e.g. spending EUR from an MYR account). Null when they match.
    if (!existing.has('account_amount')) {
      db.execSync('ALTER TABLE transactions ADD COLUMN account_amount REAL;');
    }
  },
};

export default migration032TransactionsAccountAmount;
