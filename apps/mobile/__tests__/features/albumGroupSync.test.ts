import { openShares, settleDebt, simplifyDebts } from '~/features/albums/lib/groupDebts';
import {
  albumLedgerId,
  albumState,
  ensureLocalAlbum,
  releaseAlbumGroup,
} from '~/features/albums/services/albumGroupStore';
import {
  type GroupEnv,
  projectGroup,
  publishAlbumBills,
} from '~/features/albums/services/albumGroupSync';
import {
  removeSharedLedger,
  saveSharedLedger,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { aggregateSettleUpByPerson } from '~/features/transactions/lib/settleUp';
import { owedToPayer } from '~/features/transactions/lib/splitPayer';
import { getDb, getSQLite } from '~/lib/db/client';
import { albumGroupsRepository } from '~/lib/repositories/albumGroupsRepository';
import { transactionSplitsRepository } from '~/lib/repositories/transactionSplitsRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';

import { openAppDatabase } from '../helpers/appDatabase';

// A shared album's group turned into the user's own entries (README: Album
// members and shared albums). Real SQL against real SQLite, through the real
// repositories: what lands in `transactions` and `transaction_splits` is what
// Balances, the lists and the totals then read.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn(), getDb: jest.fn() }));
// Drizzle's driver imports it for live queries only.
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: jest.fn() }));
// The real Drizzle, where other tests use a stub (jest.config.js): the
// repositories run their queries here.
// Both names map to that one stub, so one mock stands for the two.
jest.mock('drizzle-orm', () => ({
  ...jest.requireActual('../../node_modules/drizzle-orm/index.cjs'),
  ...jest.requireActual('../../node_modules/drizzle-orm/sqlite-core/index.cjs'),
}));
jest.mock('~/services/userAssets', () => ({ getProfileAvatarUri: () => null }));

const NOW = '2026-11-12T00:00:00.000Z';
const GROUP = 'bali';

const env: GroupEnv = {
  userId: 'u-me',
  meLabel: 'Me',
  rateTable: { base: 'MYR', rates: { MYR: 1 }, asOfDate: null },
  reportingCurrency: 'MYR',
  currencyOf: () => 'MYR',
  defaultAccountId: 'cash',
  defaultPaybackAccountId: 'bank',
  categoryIdFor: () => 'food',
};

let app: ReturnType<typeof openAppDatabase>;

beforeEach(() => {
  app = openAppDatabase();
  (getSQLite as jest.Mock).mockReturnValue(app.db);
  (getDb as jest.Mock).mockReturnValue(app.orm);
  app.connection.exec(`
    INSERT INTO albums (id, ledger_id, name, is_active, sort_order, created_at, updated_at)
      VALUES ('${GROUP}', 'default', 'Bali trip', 1, 0, '${NOW}', '${NOW}');
  `);
  saveSharedLedger({
    ledgerId: GROUP,
    shareId: 'share-bali',
    role: 'owner',
    name: 'Bali trip',
    ownerName: 'Nelson',
    memberCount: 2,
    active: true,
    userId: 'u-me',
    ownerUserId: 'u-me',
    kind: 'album',
  });
  albumGroupsRepository.createMember(GROUP, { id: 'me', name: 'Nelson', userId: 'u-me' });
  albumGroupsRepository.createMember(GROUP, { id: 'aisha', name: 'Aisha', userId: 'u-aisha' });
  albumGroupsRepository.createMember(GROUP, { id: 'ben', name: 'Ben' });
});

afterEach(() => {
  removeSharedLedger(GROUP);
  app.close();
});

function addBill(id: string, paidBy: string, amount = 90) {
  albumGroupsRepository.upsertExpense({
    id,
    groupId: GROUP,
    date: '2026-11-12',
    note: 'Dinner',
    amount,
    currency: 'MYR',
    categoryName: 'Food',
    categoryIcon: '🍽️',
    paidBy,
    shares: ['me', 'aisha', 'ben'].map((memberId) => ({ memberId, amount: amount / 3 })),
    createdBy: 'u-aisha',
  });
}

function pay(id: string, expenseId: string, from: string, to: string, amount: number, at: string) {
  albumGroupsRepository.createSettlement({
    id,
    groupId: GROUP,
    expenseId,
    fromMember: from,
    toMember: to,
    amount,
    currency: 'MYR',
    date: at.slice(0, 10),
    createdBy: 'u-aisha',
    createdAt: at,
  });
}

const tx = (id: string) =>
  app.all(
    'SELECT amount, account_id, category_id, note, album_group_id, reporting_amount, deleted_at, type, from_account_id, to_account_id FROM transactions WHERE id = ?',
    id,
  )[0];
const liveTransactions = () =>
  app.all('SELECT id, type, amount FROM transactions WHERE deleted_at IS NULL ORDER BY id');
const balances = () => {
  const list = transactionsRepository.list();
  const summary = aggregateSettleUpByPerson(list, { reportingCurrency: 'MYR' });
  return Object.fromEntries(summary.people.map((person) => [person.name, person.netReporting]));
};

describe('a bill another member paid', () => {
  it('is the user’s share, owed to them, on no account', () => {
    addBill('dinner', 'aisha');
    expect(projectGroup(GROUP, env)).toBe(true);
    expect(tx('dinner')).toMatchObject({
      amount: 30,
      account_id: null,
      category_id: 'food',
      note: 'Dinner',
      album_group_id: GROUP,
      reporting_amount: 30,
    });
    const splits = transactionSplitsRepository.listByTransactionId('dinner');
    expect(
      splits.map((split) => [split.personName, split.amount, split.shareAmount, split.isPayer]),
    ).toEqual([
      ['Me', 30, null, false],
      ['Aisha', 0, 30, true],
      ['Ben', 0, 30, false],
    ]);
    expect(owedToPayer(splits, 30)).toMatchObject({ personName: 'Aisha', owed: 30, total: 30 });
    expect(balances()).toEqual({ Aisha: -30 });
    // In the album, and nothing more to do the second time.
    expect(
      app.all('SELECT transaction_id FROM album_transactions WHERE album_id = ?', GROUP),
    ).toEqual([{ transaction_id: 'dinner' }]);
    expect(projectGroup(GROUP, env)).toBe(false);
  });

  it('paid back in parts: each part is its own expense, the last puts the bill on its account', () => {
    addBill('dinner', 'aisha');
    pay('s1', 'dinner', 'me', 'aisha', 12, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 18, account_id: null });
    expect(tx('dinner:x:s1')).toMatchObject({
      type: 'expense',
      amount: 12,
      account_id: 'cash',
      category_id: 'food',
      album_group_id: null,
    });
    let splits = transactionSplitsRepository.listByTransactionId('dinner');
    expect(owedToPayer(splits, 18)).toMatchObject({ owed: 18, total: 30, paid: 12 });
    expect(balances()).toEqual({ Aisha: -18 });

    pay('s2', 'dinner', 'me', 'aisha', 18, '2026-11-14T08:00:00.000Z');
    projectGroup(GROUP, env, { hints: { accounts: new Map([['s2', 'bank']]) } });
    expect(tx('dinner')).toMatchObject({ amount: 18, account_id: 'bank' });
    splits = transactionSplitsRepository.listByTransactionId('dinner');
    expect(owedToPayer(splits, 18)).toMatchObject({ owed: 0, total: 30, paid: 30 });
    expect(balances()).toEqual({ Aisha: 0 });
    expect(projectGroup(GROUP, env)).toBe(false);

    // The first part undone: the bill is owed again, less the part still paid.
    albumGroupsRepository.softDeleteSettlement('s1');
    projectGroup(GROUP, env);
    expect(tx('dinner:x:s1').deleted_at).not.toBeNull();
    expect(tx('dinner')).toMatchObject({ amount: 12, account_id: null });
    expect(tx('dinner:x:s2')).toMatchObject({ amount: 18, account_id: 'bank' });
    expect(balances()).toEqual({ Aisha: -12 });
  });
});

describe('a bill the user paid', () => {
  it('is the whole bill, with what each member owes', () => {
    addBill('dinner', 'me');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 90, account_id: 'cash', album_group_id: GROUP });
    expect(balances()).toEqual({ Aisha: 30, Ben: 30 });
  });

  it('a member’s payment lowers the expense and moves the money to the payback account', () => {
    addBill('dinner', 'me');
    pay('s1', 'dinner', 'aisha', 'me', 10, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 80, reporting_amount: 80 });
    expect(tx('dinner:t:s1')).toMatchObject({
      type: 'transfer',
      amount: 10,
      from_account_id: 'cash',
      to_account_id: 'bank',
    });
    expect(balances()).toEqual({ Aisha: 20, Ben: 30 });
    const aisha = transactionSplitsRepository
      .listByTransactionId('dinner')
      .filter((split) => split.albumMemberId === 'aisha');
    expect(
      aisha.map((split) => [split.amount, !!split.paidAt, split.settlementId, split.partOfSplitId]),
    ).toEqual([
      [20, false, null, null],
      [10, true, 's1', 'dinner:aisha'],
    ]);
    expect(projectGroup(GROUP, env)).toBe(false);

    // The rest: the share's own row is the last payment.
    pay('s2', 'dinner', 'aisha', 'me', 20, '2026-11-14T08:00:00.000Z');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 60 });
    expect(balances()).toEqual({ Aisha: 0, Ben: 30 });

    // Both undone: the bill and the account are as they were.
    albumGroupsRepository.softDeleteSettlement('s1');
    albumGroupsRepository.softDeleteSettlement('s2');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 90, reporting_amount: 90 });
    expect(liveTransactions()).toEqual([{ id: 'dinner', type: 'expense', amount: 90 }]);
    expect(balances()).toEqual({ Aisha: 30, Ben: 30 });
  });

  it('keeps the account the phone chose, and writes no transfer within one account', () => {
    addBill('dinner', 'me');
    pay('s1', 'dinner', 'aisha', 'me', 30, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, env, { hints: { accounts: new Map([['s1', 'cash']]) } });
    expect(liveTransactions()).toEqual([{ id: 'dinner', type: 'expense', amount: 60 }]);
    // Projected again without the hint, the row's own account stands.
    expect(projectGroup(GROUP, env)).toBe(false);
  });
});

describe('changes to a bill', () => {
  it('follows an edit, keeps the user’s own category, and goes with the bill', () => {
    addBill('dinner', 'aisha');
    projectGroup(GROUP, env);
    transactionsRepository.update('dinner', { categoryId: 'drinks' });
    addBill('dinner', 'aisha', 120);
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 40, category_id: 'drinks' });

    // Now the user paid it: the same entry becomes the whole bill.
    addBill('dinner', 'me', 120);
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 120, account_id: 'cash' });
    expect(balances()).toEqual({ Aisha: 40, Ben: 40 });

    albumGroupsRepository.softDeleteExpense('dinner');
    projectGroup(GROUP, env);
    expect(liveTransactions()).toEqual([]);
    // And comes back with it.
    addBill('dinner', 'me', 120);
    projectGroup(GROUP, env);
    expect(liveTransactions()).toEqual([{ id: 'dinner', type: 'expense', amount: 120 }]);
    expect(balances()).toEqual({ Aisha: 40, Ben: 40 });
  });

  it('a bill taken out of the group takes its payments with it', () => {
    addBill('dinner', 'me');
    pay('s1', 'dinner', 'aisha', 'me', 10, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, env);
    albumGroupsRepository.softDeleteExpense('dinner');
    projectGroup(GROUP, env);
    expect(liveTransactions()).toEqual([]);
    expect(albumGroupsRepository.listSettlements(GROUP).filter((s) => !s.deletedAt)).toEqual([]);
    // Saved again under its id, nobody has paid anything yet.
    addBill('dinner', 'me');
    projectGroup(GROUP, env);
    expect(liveTransactions()).toEqual([{ id: 'dinner', type: 'expense', amount: 90 }]);
    expect(balances()).toEqual({ Aisha: 30, Ben: 30 });
  });

  it('leaves the user’s own row as another phone of theirs named it', () => {
    addBill('dinner', 'aisha');
    projectGroup(GROUP, env);
    // The same account on a phone in another language.
    expect(projectGroup(GROUP, { ...env, meLabel: '我' })).toBe(false);
    const own = transactionSplitsRepository.listByTransactionId('dinner').find((s) => s.isSelf);
    expect(own?.personName).toBe('Me');
  });

  it('is not the user’s entry when they have no part in it', () => {
    albumGroupsRepository.upsertExpense({
      id: 'massage',
      groupId: GROUP,
      date: '2026-11-12',
      note: 'Massage',
      amount: 80,
      currency: 'MYR',
      categoryName: null,
      categoryIcon: null,
      paidBy: 'aisha',
      shares: [
        { memberId: 'aisha', amount: 40 },
        { memberId: 'ben', amount: 40 },
      ],
      createdBy: 'u-aisha',
    });
    expect(projectGroup(GROUP, env)).toBe(false);
    expect(liveTransactions()).toEqual([]);
  });

  it('waits until this phone has a member of its own', () => {
    addBill('dinner', 'aisha');
    expect(projectGroup(GROUP, { ...env, userId: 'u-someone-new' })).toBe(false);
    expect(liveTransactions()).toEqual([]);
  });
});

describe('simplify group debts', () => {
  it('is off until someone turns it on, for the whole group', () => {
    expect(albumGroupsRepository.simplifiesDebts(GROUP)).toBe(false);
    albumGroupsRepository.setSimplifyDebts(GROUP, true);
    expect(albumGroupsRepository.simplifiesDebts(GROUP)).toBe(true);
    // One row per group, routed with the group's other rows.
    expect(app.all('SELECT id, ledger_id, simplify_debts FROM album_groups')).toEqual([
      { id: GROUP, ledger_id: GROUP, simplify_debts: 1 },
    ]);
    albumGroupsRepository.setSimplifyDebts(GROUP, false);
    expect(albumGroupsRepository.simplifiesDebts(GROUP)).toBe(false);
  });

  it('a debt paid past the user closes both their bills and leaves them even', () => {
    // Aisha owes the user 30; the user owes Ben 30: Aisha pays Ben.
    const shares = (owes: Record<string, number>) =>
      Object.entries(owes).map(([memberId, amount]) => ({ memberId, amount }));
    const add = (id: string, paidBy: string, owes: Record<string, number>) =>
      albumGroupsRepository.upsertExpense({
        id,
        groupId: GROUP,
        date: '2026-11-12',
        note: id,
        amount: Object.values(owes).reduce((sum, value) => sum + value, 0),
        currency: 'MYR',
        categoryName: null,
        categoryIcon: null,
        paidBy,
        shares: shares(owes),
        createdBy: 'u-me',
      });
    add('dinner', 'me', { me: 30, aisha: 30 });
    add('boat', 'ben', { ben: 30, me: 30 });
    projectGroup(GROUP, env);
    expect(balances()).toEqual({ Aisha: 30, Ben: -30 });

    const open = openShares(
      albumGroupsRepository.listExpenses(GROUP),
      albumGroupsRepository.listSettlements(GROUP),
    );
    const simple = simplifyDebts(open);
    expect(simple).toEqual([{ from: 'aisha', to: 'ben', currency: 'MYR', amount: 30 }]);
    // Recorded on Aisha's phone: the user's phone only sees the settlements.
    settleDebt(open, simple[0]).forEach((item, index) =>
      pay(`s${index}`, item.expenseId, item.from, item.to, item.amount, '2026-11-13T08:00:00.000Z'),
    );
    projectGroup(GROUP, env);
    expect(balances()).toEqual({ Aisha: 0, Ben: 0 });
    // Paid back for the dinner, and paid for the boat: 30 in, 30 out.
    expect(tx('dinner')).toMatchObject({ amount: 30 });
    expect(tx('boat')).toMatchObject({ amount: 30, account_id: 'cash' });
    expect(projectGroup(GROUP, env)).toBe(false);
  });
});

describe('sharing an album that already has split bills', () => {
  function addLocalBill() {
    app.connection.exec(`
      INSERT INTO transactions (id, ledger_id, type, amount, currency, reporting_currency, reporting_amount, fx_rate, date, account_id, category_id, note, created_at, updated_at)
        VALUES ('lunch', 'default', 'expense', 50, 'MYR', 'MYR', 50, 1, '2026-11-10', 'cash', 'food', 'Lunch', '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, from_account_id, to_account_id, created_at, updated_at)
        VALUES ('lunch-transfer', 'default', 'transfer', 10, 'MYR', '2026-11-11', 'cash', 'bank', '${NOW}', '${NOW}');
      INSERT INTO album_transactions (id, album_id, transaction_id, sort_order, created_at, updated_at)
        VALUES ('join-1', '${GROUP}', 'lunch', 0, '${NOW}', '${NOW}');
      INSERT INTO transaction_splits (id, transaction_id, person_name, amount, is_self, payback_account_id, sort_order, created_at, updated_at)
        VALUES ('r-self', 'lunch', 'Me', 20, 1, NULL, 0, '${NOW}', '${NOW}');
      INSERT INTO transaction_splits (id, transaction_id, person_name, amount, is_self, payback_account_id, album_member_id, sort_order, created_at, updated_at)
        VALUES ('r-aisha', 'lunch', 'Aisha', 10, 0, 'bank', 'aisha', 1, '${NOW}', '${NOW}');
      INSERT INTO transaction_splits (id, transaction_id, person_name, amount, is_self, payback_account_id, paid_at, paid_transaction_id, part_of_split_id, sort_order, created_at, updated_at)
        VALUES ('r-aisha-part', 'lunch', 'Aisha', 10, 0, 'bank', '2026-11-11T09:00:00.000Z', 'lunch-transfer', 'r-aisha', 1, '${NOW}', '${NOW}');
      INSERT INTO transaction_splits (id, transaction_id, person_name, amount, is_self, payback_account_id, sort_order, created_at, updated_at)
        VALUES ('r-chen', 'lunch', 'Chen', 20, 0, 'cash', 2, '${NOW}', '${NOW}');
    `);
  }

  it('puts the bill and its payments in the group without changing the entries', () => {
    addLocalBill();
    publishAlbumBills(GROUP, env);
    const expense = albumGroupsRepository.listExpenses(GROUP).find((e) => e.id === 'lunch')!;
    const chen = albumGroupsRepository.listMembers(GROUP).find((m) => m.name === 'Chen')!;
    expect(expense).toMatchObject({ amount: 60, paidBy: 'me', categoryName: null });
    expect(expense.shares).toEqual([
      { memberId: 'aisha', amount: 20 },
      { memberId: chen.id, amount: 20 },
      { memberId: 'me', amount: 20 },
    ]);
    const settlements = albumGroupsRepository.listSettlements(GROUP);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({
      expenseId: 'lunch',
      fromMember: 'aisha',
      toMember: 'me',
      amount: 10,
      createdAt: '2026-11-11T09:00:00.000Z',
    });
    expect(tx('lunch').album_group_id).toBe(GROUP);

    const before = app.all('SELECT * FROM transaction_splits ORDER BY id');
    const beforeTx = app.all('SELECT id, amount, deleted_at FROM transactions ORDER BY id');
    // The rows the group would write are the ones already there, bar who each is with.
    projectGroup(GROUP, env);
    const after = app.all('SELECT * FROM transaction_splits ORDER BY id');
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(
      after.map((row) => [row.id, row.amount, row.paid_transaction_id, row.deleted_at]),
    ).toEqual(before.map((row) => [row.id, row.amount, row.paid_transaction_id, row.deleted_at]));
    expect(app.all('SELECT id, amount, deleted_at FROM transactions ORDER BY id')).toEqual(
      beforeTx,
    );
    expect(balances()).toEqual({ Aisha: 10, Chen: 20 });
    expect(projectGroup(GROUP, env)).toBe(false);
  });

  it('brings back an album deleted here when it is joined again', () => {
    app.connection.exec(`UPDATE albums SET deleted_at = '${NOW}' WHERE id = '${GROUP}'`);
    expect(albumState(GROUP)).toBe('deleted');
    ensureLocalAlbum({ ledgerId: GROUP, name: 'Bali trip' });
    expect(albumState(GROUP)).toBe('live');
    expect(albumLedgerId(GROUP)).toBe('default');
    expect(app.all('SELECT COUNT(*) AS n FROM albums')[0].n).toBe(1);
  });

  it('gives the album back as the user’s own when sharing ends', () => {
    addLocalBill();
    publishAlbumBills(GROUP, env);
    removeSharedLedger(GROUP);
    releaseAlbumGroup(GROUP, 'u-me');
    expect(app.all('SELECT COUNT(*) AS n FROM album_expenses')[0].n).toBe(0);
    expect(app.all('SELECT COUNT(*) AS n FROM album_members')[0].n).toBe(0);
    expect(tx('lunch').album_group_id).toBeNull();
    const album = app.all('SELECT split_with_json FROM albums WHERE id = ?', GROUP)[0];
    expect(
      (JSON.parse(String(album.split_with_json)) as { name: string }[]).map((p) => p.name),
    ).toEqual(['Aisha', 'Ben', 'Chen']);
    // The entries stay, as ordinary split bills.
    expect(balances()).toEqual({ Aisha: 10, Chen: 20 });
  });
});
