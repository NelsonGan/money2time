import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration077RecurringAnchorDay: DbMigration = {
  version: 77,
  name: '077_recurring_anchor_day',
  up(db) {
    // The day of the month (1 to 31) a monthly or yearly rule was set for. The
    // runner used to keep only the next run date, so a rule on the 31st that
    // ran on February 28 stayed on the 28th from then on. With the anchor it
    // returns to the 31st, or the month's last day when the month is shorter
    // (utils/recurringRules.ts `nextRunAfter`).
    //
    // Left null here: existing rules are repaired from their own run history
    // by `recurringRulesRepository.repairLegacySchedules`, which the app runs
    // before every recurring run, so it also covers rules that arrive later
    // without one (an older backup, an older phone through Cloud Sync).
    addColumnIfMissing(db, 'recurring_rules', 'anchor_day', 'INTEGER');
  },
};

export default migration077RecurringAnchorDay;
