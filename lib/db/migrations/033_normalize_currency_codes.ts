import { normalizeCurrencyColumns } from '../normalizeCurrencies';
import type { DbMigration } from './types';

export const migration033NormalizeCurrencyCodes: DbMigration = {
  version: 33,
  name: '033_normalize_currency_codes',
  up(db) {
    // Convert legacy symbol-based currency values (e.g. "RM") left by older
    // versions / imports into ISO codes (e.g. "MYR").
    normalizeCurrencyColumns(db);
  },
};

export default migration033NormalizeCurrencyCodes;
