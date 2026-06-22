import type { DbMigration } from './types';

export const migration027ExchangeRatesTable: DbMigration = {
  version: 27,
  name: '027_exchange_rates_table',
  up(db) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id TEXT PRIMARY KEY NOT NULL,
        base_currency TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        rate REAL NOT NULL,
        as_of_date TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'api',
        updated_at TEXT NOT NULL
      );
    `);
    db.execSync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_rates_pair ON exchange_rates (base_currency, quote_currency);',
    );
  },
};

export default migration027ExchangeRatesTable;
