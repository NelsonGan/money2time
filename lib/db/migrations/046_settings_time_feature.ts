import type { DbMigration } from './types';

export const migration046SettingsTimeFeature: DbMigration = {
  version: 46,
  name: '046_settings_time_feature',
  up(db) {
    // Whether the "see money as time" feature is available at all. Defaults to
    // on so existing users keep their current behavior; new users pick during
    // onboarding, and it can be flipped anytime under Settings > Personalization.
    db.execSync(`ALTER TABLE settings ADD COLUMN time_feature_enabled INTEGER NOT NULL DEFAULT 1;`);
  },
};

export default migration046SettingsTimeFeature;
