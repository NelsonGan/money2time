import type { DbMigration } from './types';

// Quick-entry note autocomplete runs on every keystroke: an exact `note = ?`
// lookup (getLatestTransactionFieldsByNote) and a `note LIKE 'prefix%'` +
// GROUP BY note scan (getDistinctNotesSuggestions). Both were full table scans;
// this partial index makes the exact and prefix lookups index-backed.
export const migration026TransactionsNoteIndex: DbMigration = {
  version: 26,
  name: '026_transactions_note_index',
  up(db) {
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_active_note
        ON transactions(note)
        WHERE deleted_at IS NULL AND note IS NOT NULL;
    `);
  },
};

export default migration026TransactionsNoteIndex;
