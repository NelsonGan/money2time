import type { DbMigration } from './types';

export const migration046TransactionSplitsNote: DbMigration = {
  version: 46,
  name: '046_transaction_splits_note',
  up(db) {
    // Optional per-split item name — auto-populated from a scanned receipt when
    // splitting by item (each split row is one receipt line item). Null for
    // ordinary person-share splits.
    db.execSync(`ALTER TABLE transaction_splits ADD COLUMN note TEXT;`);
  },
};

export default migration046TransactionSplitsNote;
