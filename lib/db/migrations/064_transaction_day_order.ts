import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration064TransactionDayOrder: DbMigration = {
  version: 64,
  name: '064_transaction_day_order',
  up(db) {
    // Where a dragged transaction sits among the others on its day. Most rows
    // are date-only (stored at local midnight), so same-day rows tie on `date`
    // and fall back to `updated_at`, newest first. A drag writes this key
    // between its new neighbours' keys instead of inventing a time of day,
    // which kept a dragged row above every record added to that day later.
    // Null (every existing row) means "use updated_at", the order users have
    // always seen. See `transactionOrderKey` in utils/transactionSorting.ts.
    addColumnIfMissing(db, 'transactions', 'day_order', 'REAL');
  },
};

export default migration064TransactionDayOrder;
