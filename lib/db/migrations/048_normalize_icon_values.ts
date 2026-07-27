import { normalizeIconColumns } from '../normalizeIcons';
import type { DbMigration } from './types';

export const migration048NormalizeIconValues: DbMigration = {
  version: 48,
  name: '048_normalize_icon_values',
  up(db) {
    // Data-only: rewrites categories.icon, accounts.goal_emoji,
    // budget_templates.emoji and monthly_budgets.template_emoji from the old
    // "bare emoji glyph, resolved to a hand-drawn PNG at render time" form into
    // the tagged grammar documented in constants/categoryIcons.ts. No schema
    // change, so no ALTER TABLE.
    //
    // Deliberately not wrapped in an explicit transaction. runMigrations bumps
    // PRAGMA user_version only once the whole batch succeeds, so a throw here
    // replays this migration on the next launch. normalizeIconValue is a
    // fixpoint, which makes that replay a no-op over rows already rewritten.
    normalizeIconColumns(db);
  },
};

export default migration048NormalizeIconValues;
