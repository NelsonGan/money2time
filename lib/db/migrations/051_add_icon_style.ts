import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration051AddIconStyle: DbMigration = {
  version: 51,
  name: '051_add_icon_style',
  up(db) {
    // Which artwork the app's own chrome draws: 'clay' (the soft-clay
    // illustrations in assets/clay-icons/) or 'flat' (the Lucide line icons
    // that preceded them). Clay is the default, so every existing install
    // keeps the look it already has.
    addColumnIfMissing(db, 'settings', 'icon_style', "TEXT NOT NULL DEFAULT 'clay'");
  },
};

export default migration051AddIconStyle;
