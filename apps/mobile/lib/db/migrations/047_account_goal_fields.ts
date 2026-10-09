import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration047AccountGoalFields: DbMigration = {
  version: 47,
  name: '047_account_goal_fields',
  up(db) {
    // Savings-goal fields on accounts (type = 'goal'). Null on every non-goal
    // account. goal_achieved_at is a persisted high-water stamp so the
    // achievement celebration fires exactly once; goal_archived_at hides the
    // goal from the Goals rail and account pickers without deleting history.
    addColumnsIfMissing(db, 'accounts', [
      ['goal_target_amount', 'REAL'],
      ['goal_target_date', 'TEXT'],
      ['goal_emoji', 'TEXT'],
      ['goal_achieved_at', 'TEXT'],
      ['goal_archived_at', 'TEXT'],
    ]);
  },
};

export default migration047AccountGoalFields;
