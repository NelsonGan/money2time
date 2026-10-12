import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration069DisplayPreferences: DbMigration = {
  version: 69,
  name: '069_display_preferences',
  up(db) {
    // Whether account pickers show each account's balance under its name. On
    // by default; the eye on the picker's title turns it off.
    addColumnIfMissing(
      db,
      'settings',
      'show_account_picker_balances',
      'INTEGER NOT NULL DEFAULT 1',
    );
    // The bottom bar's five tabs, in order. Null means the default set. Parse
    // with parseNavTabs.
    addColumnIfMissing(db, 'settings', 'nav_tabs_json', 'TEXT');
  },
};

export default migration069DisplayPreferences;
