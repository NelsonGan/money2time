import { addColumnIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration084TransferFees: DbMigration = {
  version: 84,
  name: '084_transfer_fees',
  up(db) {
    // A fee charged on a transfer (a card top-up to an e-wallet, say) is its
    // own expense row on the account that paid it. This links that expense to
    // its transfer, so the editor shows and edits the two together. Null on
    // every other row. The fee stays a complete expense on its own, so older
    // app versions, the Web Dashboard, Cloud Sync and backups count it right
    // without knowing about fees.
    addColumnIfMissing(db, 'transactions', 'fee_of_id', 'TEXT');
  },
};

export default migration084TransferFees;
