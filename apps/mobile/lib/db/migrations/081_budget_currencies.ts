import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

// A budget can be kept in a currency other than the ledger's main one (a JPY
// trip budget in a MYR ledger, an SGD monthly budget for someone paid in SGD).
// - budget_templates.currency / monthly_budgets.currency: the budget's
//   currency. NULL means the ledger's main currency, so every budget made
//   before this reads as before without a backfill (the main currency cannot
//   change without wiping the ledger's data). An older app version, which
//   does not know the column, writes budgets in the main currency.
// - monthly_budgets.fx_rate: how much one unit of the budget's currency was
//   worth in the main currency when the budget was made (or its currency was
//   changed). Spending in another currency is valued through it, so a past
//   budget's figures never move with the exchange rate, like a transaction's
//   frozen `fx_rate`. NULL for a main-currency budget, or when no rate was
//   known then (the budget falls back to the latest rate).
export const migration081BudgetCurrencies: DbMigration = {
  // 81, not 80: it first shipped as a second version 80 beside
  // 080_account_archived_at, which the migration runner refuses at startup.
  version: 81,
  name: '081_budget_currencies',
  up(db) {
    addColumnIfMissing(db, 'budget_templates', 'currency', 'TEXT');
    addColumnIfMissing(db, 'monthly_budgets', 'currency', 'TEXT');
    addColumnIfMissing(db, 'monthly_budgets', 'fx_rate', 'REAL');
  },
};

export default migration081BudgetCurrencies;
