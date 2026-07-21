import type { DbMigration } from './types';

export const migration046AccountCardColor: DbMigration = {
  version: 46,
  name: '046_account_card_color',
  up(db) {
    // Per-account card color id (from constants/cardColors). Null means "auto",
    // which derives a stable color from the account's logo or id at render time.
    db.execSync(`ALTER TABLE accounts ADD COLUMN card_color TEXT;`);
  },
};

export default migration046AccountCardColor;
