import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

const migration064SettingsAnalyticsConsent: DbMigration = {
  version: 64,
  name: '064_settings_analytics_consent',
  up(db) {
    addColumnsIfMissing(db, 'settings', [['analytics_enabled', 'INTEGER NOT NULL DEFAULT 0']]);
  },
};

export default migration064SettingsAnalyticsConsent;
