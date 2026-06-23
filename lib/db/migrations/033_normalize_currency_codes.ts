import { normalizeCurrencyColumns } from '../normalizeCurrencies';
import type { DbMigration } from './types';

export const migration033NormalizeCurrencyCodes: DbMigration = {
  version: 33,
  name: '033_normalize_currency_codes',
  up(db) {
    // This DB predates multi-currency, so it is single-currency by definition.
    // Collapse every currency value to the main code — including stray values
    // that happen to be valid ISO codes (e.g. a "USD" placeholder left by an
    // old default account template) which must not become a foreign account.
    normalizeCurrencyColumns(db, { collapseAll: true });
  },
};

export default migration033NormalizeCurrencyCodes;
