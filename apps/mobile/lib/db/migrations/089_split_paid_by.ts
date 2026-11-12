import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

export const migration089SplitPaidBy: DbMigration = {
  version: 89,
  name: '089_split_paid_by',
  up(db) {
    // A split bill a friend paid for. The expense is then the user's own share
    // and the user owes it to that friend, whose row carries `is_payer`. The
    // friends' rows on such a bill keep `amount` at 0, because `amount` is what
    // a person owes the user and here nobody does; their share of the bill is
    // in `share_amount` instead. An app version from before this reads only
    // `amount`, so it sees a plain expense for the user's share and never
    // counts these friends as owing. Both are null on every other row.
    //
    // `member_id` is who the person is once they are a real user: the Cloud
    // Sync account of a member of a shared group. Nothing sets it yet (a person
    // is a name typed on the bill), but balances already group by it when it
    // is there, so a later version can link a name to an account without
    // another pass over how debts are keyed.
    addColumnsIfMissing(db, 'transaction_splits', [
      ['is_payer', 'INTEGER'],
      ['share_amount', 'REAL'],
      ['member_id', 'TEXT'],
    ]);
  },
};

export default migration089SplitPaidBy;
