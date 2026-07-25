import type { DbMigration } from './types';

export const migration046AccountGoalFields: DbMigration = {
  version: 46,
  name: '046_account_goal_fields',
  up(db) {
    // Savings-goal fields on accounts (type = 'goal'). Null on every non-goal
    // account. goal_achieved_at is a persisted high-water stamp so the
    // achievement celebration fires exactly once; goal_archived_at hides the
    // goal from the Goals rail and account pickers without deleting history.
    db.execSync(`ALTER TABLE accounts ADD COLUMN goal_target_amount REAL;`);
    db.execSync(`ALTER TABLE accounts ADD COLUMN goal_target_date TEXT;`);
    db.execSync(`ALTER TABLE accounts ADD COLUMN goal_emoji TEXT;`);
    db.execSync(`ALTER TABLE accounts ADD COLUMN goal_achieved_at TEXT;`);
    db.execSync(`ALTER TABLE accounts ADD COLUMN goal_archived_at TEXT;`);
  },
};

export default migration046AccountGoalFields;
