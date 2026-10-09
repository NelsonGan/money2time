import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration056RecurringLogoId: DbMigration = {
  version: 56,
  name: '056_recurring_logo_id',
  up(db) {
    // Subscription-service logo shown on a recurring rule (Netflix, Spotify,
    // a telecom plan...). Mirrors accounts.logo_id: either a bundled catalog id
    // `<countrySlug>/<brandSlug>` (see constants/subscriptionLogos.ts) or a
    // `custom:` user-asset id. NULL on every existing rule, which renders the
    // same repeat glyph those rules already show.
    addColumnIfMissing(db, 'recurring_rules', 'logo_id', 'TEXT');
  },
};

export default migration056RecurringLogoId;
