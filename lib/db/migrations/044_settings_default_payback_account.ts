import type { DbMigration } from './types';

export const migration044SettingsDefaultPaybackAccount: DbMigration = {
  version: 44,
  name: '044_settings_default_payback_account',
  up(db) {
    // Default "paid to" account for new split-bill payback rows. Chosen once on
    // the Settle Up screen; new splits pre-fill their payback account with it.
    db.execSync(`ALTER TABLE settings ADD COLUMN default_payback_account_id TEXT;`);
  },
};

export default migration044SettingsDefaultPaybackAccount;
