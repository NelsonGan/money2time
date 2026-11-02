import type { DbMigration } from './types';

// The month cycle (first day of month and custom months) becomes each
// ledger's own. The default ledger keeps it on the settings row; every other
// ledger keeps it in `ledgers.prefs_json`, as `firstDayOfMonth` and
// `firstDayOverridesJson`, and reads the settings row's while it has none
// (lib/repositories/ledgerPrefs.ts `monthCycleForLedger`).
//
// - Until now every ledger read the settings row's cycle, so each existing
//   ledger is given that cycle here and nothing it shows changes.
// - A ledger can still arrive without one: joined from someone else (its
//   preferences stay on each member's phone, so they come down empty) or
//   restored from an older backup. Two triggers give it the settings row's
//   cycle before that row's cycle changes or the row is replaced, whoever
//   writes it: the app, a Cloud Sync pull, Erase all data or a restore.
//
// A preferences blob that is not a JSON object starts over as '{}'. The CASE
// nesting keeps json_type() away from malformed JSON, which it rejects.
const NEEDS_CYCLE = `
  id <> 'default'
  AND deleted_at IS NULL
  AND CASE WHEN json_valid(prefs_json) THEN
        CASE WHEN json_type(prefs_json) = 'object'
          THEN IFNULL(json_type(prefs_json, '$.firstDayOfMonth'), '') NOT IN ('integer', 'real')
          ELSE 1 END
      ELSE 1 END`;

const PREFS_OBJECT = `
  CASE WHEN json_valid(prefs_json) THEN
    CASE WHEN json_type(prefs_json) = 'object' THEN prefs_json ELSE '{}' END
  ELSE '{}' END`;

/**
 * Stamps the cycle `day`/`overrides` (SQL expressions) on every ledger without
 * one. `updated_at` is left alone: every phone runs these triggers itself, so
 * the stamp needs no syncing, and a newer `updated_at` would make Cloud Sync
 * keep this phone's copy of the ledger over a newer edit from another phone.
 */
function stampLedgers(day: string, overrides: string, also = '1'): string {
  return `
    UPDATE ledgers
    SET prefs_json = json_set(${PREFS_OBJECT},
          '$.firstDayOfMonth', ${day},
          '$.firstDayOverridesJson', ${overrides})
    WHERE ${also} AND ${NEEDS_CYCLE};`;
}

export const migration076LedgerMonthCycles: DbMigration = {
  version: 76,
  name: '076_ledger_month_cycles',
  up(db) {
    db.execSync(`
      ${stampLedgers(
        "(SELECT first_day_of_month FROM settings WHERE id = 'primary')",
        "(SELECT first_day_overrides_json FROM settings WHERE id = 'primary')",
        "EXISTS (SELECT 1 FROM settings WHERE id = 'primary')",
      )}

      CREATE TRIGGER IF NOT EXISTS ledgers_keep_month_cycle_on_settings_update
      BEFORE UPDATE OF first_day_of_month, first_day_overrides_json ON settings
      WHEN OLD.first_day_of_month IS NOT NEW.first_day_of_month
        OR OLD.first_day_overrides_json IS NOT NEW.first_day_overrides_json
      BEGIN
        ${stampLedgers('OLD.first_day_of_month', 'OLD.first_day_overrides_json')}
      END;

      CREATE TRIGGER IF NOT EXISTS ledgers_keep_month_cycle_on_settings_delete
      BEFORE DELETE ON settings
      BEGIN
        ${stampLedgers('OLD.first_day_of_month', 'OLD.first_day_overrides_json')}
      END;
    `);
  },
};

export default migration076LedgerMonthCycles;
