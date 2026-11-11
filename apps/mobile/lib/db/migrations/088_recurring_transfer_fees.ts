import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

// A recurring transfer can carry a fee, the same as a one-off transfer (a
// monthly top-up from a card to an e-wallet that charges 1%). Each run writes
// the transfer and, beside it, the fee as its own expense row linked by
// `transactions.fee_of_id` (migration 085). The rule keeps what to write:
// - fee_amount: in fee_currency; null or 0 means no fee;
// - fee_currency: the paying account's currency when the fee was set;
// - fee_side: 'from' or 'to', the transfer account that pays it;
// - fee_category_id: the expense category the fee is filed under.
// All nullable, so every existing rule reads as one without a fee, and older
// app versions running the rule simply write no fee.
export const migration088RecurringTransferFees: DbMigration = {
  version: 88,
  name: '088_recurring_transfer_fees',
  up(db) {
    addColumnsIfMissing(db, 'recurring_rules', [
      ['fee_amount', 'REAL'],
      ['fee_currency', 'TEXT'],
      ['fee_side', 'TEXT'],
      ['fee_category_id', 'TEXT'],
    ]);
  },
};

export default migration088RecurringTransferFees;
