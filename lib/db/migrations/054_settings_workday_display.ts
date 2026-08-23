import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration054SettingsWorkdayDisplay: DbMigration = {
  version: 54,
  name: '054_settings_workday_display',
  up(db) {
    // Opt-in only: existing users continue seeing total hours after upgrading.
    // Eight hours is a useful starting value when they enable working-day display.
    addColumnsIfMissing(db, 'settings', [
      ['workday_display_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['working_hours_per_day', 'REAL NOT NULL DEFAULT 8'],
    ]);
  },
};

export default migration054SettingsWorkdayDisplay;
