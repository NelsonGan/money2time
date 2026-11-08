import type { DbMigration } from './types';

// Deleting a transaction also deletes the fee charged on it (rows whose
// `fee_of_id` points at it; see `transactionsRepository.softDeleteMany`), so
// every delete looks fees up by `fee_of_id`. Few rows have one, so a partial
// index keeps that lookup from scanning the whole table.
export const migration087TransactionFeeIndex: DbMigration = {
  version: 87,
  name: '087_transaction_fee_index',
  up(db) {
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_fee_of_id
        ON transactions(fee_of_id)
        WHERE fee_of_id IS NOT NULL;
    `);
  },
};

export default migration087TransactionFeeIndex;
