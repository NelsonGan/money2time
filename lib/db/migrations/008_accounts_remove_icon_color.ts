import type { DbMigration } from './types';

export const migration008AccountsRemoveIconColor: DbMigration = {
  version: 8,
  name: '008_accounts_remove_icon_color',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(accounts);');
    const hasIcon = columns.some((column) => column.name === 'icon');
    const hasColor = columns.some((column) => column.name === 'color');
    if (hasIcon) {
      db.execSync('ALTER TABLE accounts DROP COLUMN icon;');
    }
    if (hasColor) {
      db.execSync('ALTER TABLE accounts DROP COLUMN color;');
    }
  },
};

export default migration008AccountsRemoveIconColor;
