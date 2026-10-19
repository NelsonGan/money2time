import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration070AccountCardDesign: DbMigration = {
  version: 70,
  name: '070_account_card_design',
  up(db) {
    // The artwork behind an account's card on the Accounts screen: a bundled
    // template id (`<genre>/<name>`, see constants/cardDesigns.ts) or a
    // `custom:card-designs/…` upload. Null keeps the plain colour card.
    addColumnIfMissing(db, 'accounts', 'card_design', 'TEXT');
  },
};

export default migration070AccountCardDesign;
