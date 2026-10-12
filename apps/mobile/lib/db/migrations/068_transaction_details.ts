import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration068TransactionDetails: DbMigration = {
  version: 68,
  name: '068_transaction_details',
  up(db) {
    // A longer free-text note kept beside the one-line `note`, which doubles
    // as the row's title. Null when the user wrote nothing.
    addColumnIfMissing(db, 'transactions', 'details', 'TEXT');
  },
};

export default migration068TransactionDetails;
