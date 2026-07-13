import type { DbMigration } from './types';

/**
 * Flags a split as a shared-item portion structurally, instead of embedding a
 * "(Shared)" marker in the item-name note. New shared portions set this to 1;
 * legacy rows default to 0 (their notes still carry the "(Shared)" prefix, which
 * the display parses as a fallback).
 */
export const migration047TransactionSplitsIsShared: DbMigration = {
  version: 47,
  name: '047_transaction_splits_is_shared',
  up(db) {
    db.execSync(`ALTER TABLE transaction_splits ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;`);
  },
};

export default migration047TransactionSplitsIsShared;
