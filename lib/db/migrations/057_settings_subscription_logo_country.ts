import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration057SettingsSubscriptionLogoCountry: DbMigration = {
  version: 57,
  name: '057_settings_subscription_logo_country',
  up(db) {
    // Which country tab the subscription-logo picker opens on. Tracked apart
    // from account_logo_country so browsing Japanese streaming services doesn't
    // move the bank picker off the user's own country.
    //
    // Deliberately its own migration rather than a second line in 056: 056 had
    // already been applied (user_version bumped) on installs that predate this
    // column, and a migration never re-runs, so appending to it would leave
    // those installs permanently without the column.
    addColumnIfMissing(db, 'settings', 'subscription_logo_country', 'TEXT');
  },
};

export default migration057SettingsSubscriptionLogoCountry;
