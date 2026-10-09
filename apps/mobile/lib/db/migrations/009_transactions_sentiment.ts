import type { DbMigration } from './types';

export const migration009TransactionsSentiment: DbMigration = {
  version: 9,
  name: '009_transactions_sentiment',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(transactions);');
    const hasSentiment = columns.some((column) => column.name === 'sentiment');
    if (!hasSentiment) {
      db.execSync("ALTER TABLE transactions ADD COLUMN sentiment TEXT NOT NULL DEFAULT 'neutral';");
    }
  },
};

export default migration009TransactionsSentiment;
