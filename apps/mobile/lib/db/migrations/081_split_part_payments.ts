import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration081SplitPartPayments: DbMigration = {
  version: 81,
  name: '081_split_part_payments',
  up(db) {
    // A part payment on a friend's share is its own paid split row, cut out of
    // the share's unpaid row: paying RM300 of RM1,000 leaves a paid RM300 row
    // and an unpaid RM700 row. This links the paid part back to the share's
    // first row, so the two read as one person's share. Null on every other
    // row. Each row stays a complete split on its own, so older app versions
    // and the Web Dashboard settle the rest as before.
    addColumnIfMissing(db, 'transaction_splits', 'part_of_split_id', 'TEXT');
  },
};

export default migration081SplitPartPayments;
