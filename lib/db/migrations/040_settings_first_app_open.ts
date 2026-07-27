import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration040SettingsFirstAppOpen: DbMigration = {
  version: 40,
  name: '040_settings_first_app_open',
  up(db) {
    // ISO timestamp of the user's first app open. Null for legacy rows until the
    // one-time backfill (backfillFirstAppOpen) fills it from their earliest
    // transaction date on the next load.
    addColumnIfMissing(db, 'settings', 'first_app_open', 'TEXT');
  },
};

export default migration040SettingsFirstAppOpen;
