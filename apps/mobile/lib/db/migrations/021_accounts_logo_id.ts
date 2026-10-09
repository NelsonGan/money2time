import type { DbMigration } from './types';

export const migration021AccountsLogoId: DbMigration = {
  version: 21,
  name: '021_accounts_logo_id',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(accounts);');
    const hasColumn = columns.some((column) => column.name === 'logo_id');

    if (!hasColumn) {
      db.execSync('ALTER TABLE accounts ADD COLUMN logo_id TEXT;');
    }
  },
};

export default migration021AccountsLogoId;
