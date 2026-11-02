import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// Who an entry belongs to in a shared ledger (README: Shared ledgers > Who
// added it). Both columns hold a Cloud Sync account id, and NULL means the
// ledger's owner, so every entry made before this (and every entry in a ledger
// that was never shared) counts as the owner's without a backfill.
// - transactions.created_by: who added the entry. Set once, never edited.
// - transactions.member_id: whose entry it is. Starts as `created_by` and can
//   be changed in the editor; it is what per-person spending reads, so it is
//   indexed (leading column, so it never competes with the date and account
//   indexes the ledger's ordinary queries use: see 075's note on ledger_id).
// - recurring_rules.member_id: the person a rule's entries belong to, copied
//   onto each run so two phones running the same rule write the same person.
// - ledger_profiles: each person's name and photo in a shared ledger, synced
//   with the ledger so the others can show them. One row per ledger and
//   account, written by that account's own phones.
// - shared_ledgers.user_id: the account this phone is signed in to for the
//   ledger, so an entry is stamped without waiting for the session to load.
export const migration079TransactionMembers: DbMigration = {
  version: 79,
  name: '079_transaction_members',
  up(db) {
    addColumnIfMissing(db, 'transactions', 'created_by', 'TEXT');
    addColumnIfMissing(db, 'transactions', 'member_id', 'TEXT');
    addColumnIfMissing(db, 'recurring_rules', 'member_id', 'TEXT');
    addColumnIfMissing(db, 'shared_ledgers', 'user_id', 'TEXT');
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_active_member_ledger_date
        ON transactions(member_id, ledger_id, date DESC)
        WHERE deleted_at IS NULL;
      CREATE TABLE IF NOT EXISTS ledger_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        ledger_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        name TEXT,
        avatar_uri TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_profiles_ledger ON ledger_profiles(ledger_id);
    `);
  },
};

export default migration079TransactionMembers;
