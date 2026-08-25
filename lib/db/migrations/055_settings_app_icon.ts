import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration055SettingsAppIcon: DbMigration = {
  version: 55,
  name: '055_settings_app_icon',
  up(db) {
    // Which home-screen icon variant the user picked (see constants/appIcons.ts).
    // 'classic' is the icon every existing install already has, so upgrading
    // changes nothing on anyone's home screen.
    addColumnIfMissing(db, 'settings', 'app_icon', "TEXT NOT NULL DEFAULT 'classic'");
  },
};

export default migration055SettingsAppIcon;
