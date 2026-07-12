import type { DbMigration } from './types';

// Numbered 046 (skipping 045) on purpose: preview builds of the receipt-scan
// branch shipped migrations 045+046, so devices that ran them sit at
// user_version 46. A latest version below that would trigger the
// reset-to-baseline path in runMigrations and wipe local data. The other half
// of the old 045 (defaulting quickEntryPrefs.addUseActionSheet to true) needs
// no migration — the key is new, so the DEFAULT_QUICK_ENTRY_PREFS merge
// already turns it on for everyone.
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
