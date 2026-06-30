import type { DbMigration } from './types';

export const migration039TransactionsReceiptUri: DbMigration = {
  version: 39,
  name: '039_transactions_receipt_uri',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(transactions);');
    const existing = new Set(columns.map((c) => c.name));

    // Relative path (within the user-assets store) of an optional receipt image
    // attached to the transaction, e.g. `receipts/9f3c.jpg`. Null when none.
    if (!existing.has('receipt_uri')) {
      db.execSync('ALTER TABLE transactions ADD COLUMN receipt_uri TEXT;');
    }
  },
};

export default migration039TransactionsReceiptUri;
