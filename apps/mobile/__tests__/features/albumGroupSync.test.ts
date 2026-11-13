import { openShares, settleDebt, simplifyDebts } from '~/features/albums/lib/groupDebts';
import {
  albumLedgerId,
  ensureLocalAlbum,
  isAlbumDeleted,
  mainLedgerTakesSharedAlbums,
  releaseAlbumGroup,
} from '~/features/albums/services/albumGroupStore';
import {
  closeEvenGroup,
  type GroupEnv,
  projectGroup,
} from '~/features/albums/services/albumGroupSync';
import {
  removeSharedLedger,
  saveSharedLedger,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { aggregateSettleUpByPerson } from '~/features/transactions/lib/settleUp';
import { owedToPayer } from '~/features/transactions/lib/splitPayer';
import { getDb, getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, setActiveLedgerId } from '~/lib/db/ledgerScope';
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

// Saved by whoever paid it, unless `by` says otherwise: the user's own
// account ('u-me') or Aisha's.
function addBill(
  id: string,
  paidBy: string,
  amount = 90,
  by = paidBy === 'me' ? 'u-me' : 'u-aisha',
) {
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
    createdBy: by,
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
    albumGroupsRepository.softDeleteSettlement(GROUP, 's1');
    projectGroup(GROUP, env);
    expect(tx('dinner:x:s1').deleted_at).not.toBeNull();
    expect(tx('dinner')).toMatchObject({ amount: 12, account_id: null });
    expect(tx('dinner:x:s2')).toMatchObject({ amount: 18, account_id: 'bank' });
    expect(balances()).toEqual({ Aisha: -12 });
  });
});

describe('a bill the user paid', () => {
  it('keeps a recorded payback frozen when exchange rates refresh', () => {
    const usd = {
      ...env,
      currencyOf: (id: string) => (id === 'bank' ? 'USD' : 'MYR'),
      rateTable: { base: 'MYR', rates: { MYR: 1, USD: 0.25 }, asOfDate: null },
    };
    addBill('dinner', 'me');
    pay('s1', 'dinner', 'aisha', 'me', 10, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, usd);
    const transfer = () =>
      app.all(
        'SELECT amount, currency, to_amount FROM transactions WHERE id = ?',
        'dinner:t:s1',
      )[0];
    expect(transfer()).toEqual({ amount: 10, currency: 'MYR', to_amount: 2.5 });
    const refreshed = { ...usd, rateTable: { ...usd.rateTable, rates: { MYR: 1, USD: 0.3 } } };
    expect(projectGroup(GROUP, refreshed)).toBe(false);
    expect(transfer()).toEqual({ amount: 10, currency: 'MYR', to_amount: 2.5 });
    // An unrelated member rename must not reprice that historical payment either.
    albumGroupsRepository.updateMember(GROUP, 'ben', { name: 'Benjamin' });
    projectGroup(GROUP, refreshed);
    expect(transfer().to_amount).toBe(2.5);
    albumGroupsRepository.updateMember(GROUP, 'aisha', { name: 'Ash' });
    projectGroup(GROUP, refreshed);
    expect(tx('dinner:t:s1').note).toBe('Ash: Dinner');
    expect(transfer().to_amount).toBe(2.5);
    expect(projectGroup(GROUP, refreshed)).toBe(false);
  });

  it('prices a payback again that was written 1:1 while the rate was missing', () => {
    const noRate = {
      ...env,
      currencyOf: (id: string) => (id === 'bank' ? 'USD' : 'MYR'),
      rateTable: { base: 'MYR', rates: { MYR: 1 }, asOfDate: null },
    };
    addBill('dinner', 'me');
    pay('s1', 'dinner', 'aisha', 'me', 10, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, noRate);
    const toAmount = () =>
      app.all('SELECT to_amount FROM transactions WHERE id = ?', 'dinner:t:s1')[0].to_amount;
    expect(toAmount()).toBe(10);
    const rated = { ...noRate, rateTable: { ...noRate.rateTable, rates: { MYR: 1, USD: 0.25 } } };
    projectGroup(GROUP, rated);
    expect(toAmount()).toBe(2.5);
    // Then it is frozen like any other.
    projectGroup(GROUP, {
      ...rated,
      rateTable: { ...rated.rateTable, rates: { MYR: 1, USD: 0.3 } },
    });
    expect(toAmount()).toBe(2.5);
  });

  it('prices a payback again once its receiving account changes currency', () => {
    let bankCurrency = 'MYR';
    const live = {
      ...env,
      currencyOf: (id: string) => (id === 'bank' ? bankCurrency : 'MYR'),
      rateTable: { base: 'MYR', rates: { MYR: 1, SGD: 0.3 }, asOfDate: null },
    };
    addBill('dinner', 'me');
    pay('s1', 'dinner', 'aisha', 'me', 10, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, live);
    const toAmount = () =>
      app.all('SELECT to_amount FROM transactions WHERE id = ?', 'dinner:t:s1')[0].to_amount;
    expect(toAmount()).toBeNull();
    bankCurrency = 'SGD';
    projectGroup(GROUP, live);
    expect(toAmount()).toBe(3);
  });

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
    albumGroupsRepository.softDeleteSettlement(GROUP, 's1');
    albumGroupsRepository.softDeleteSettlement(GROUP, 's2');
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

    // Now the user paid it (saved in the editor, which names the account):
    // the same entry becomes the whole bill.
    addBill('dinner', 'me', 120);
    projectGroup(GROUP, env, { expenseId: 'dinner', hints: { entry: { accountId: 'cash' } } });
    expect(tx('dinner')).toMatchObject({ amount: 120, account_id: 'cash' });
    expect(balances()).toEqual({ Aisha: 40, Ben: 40 });

    albumGroupsRepository.softDeleteExpense(GROUP, 'dinner', 'u-me');
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
    albumGroupsRepository.softDeleteExpense(GROUP, 'dinner', 'u-me');
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

  it('never writes into an album of another ledger that has the group’s id', () => {
    // A member of a shared ledger knows its albums' ids, and could share a
    // group under one: the group only ever writes into the main ledger.
    app.connection.exec(`UPDATE albums SET ledger_id = 'work' WHERE id = '${GROUP}'`);
    addBill('dinner', 'aisha');
    setActiveLedgerId('work');
    try {
      expect(projectGroup(GROUP, env)).toBe(false);
    } finally {
      setActiveLedgerId(DEFAULT_LEDGER_ID);
    }
    expect(liveTransactions()).toEqual([]);
  });
});

describe('which account a bill is on', () => {
  it('a bill paid by the user that someone else wrote waits on no account until the editor gives it one', () => {
    addBill('dinner', 'me', 90, 'u-aisha');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 90, account_id: null, album_group_id: GROUP });
    // The others still owe the user their shares.
    expect(balances()).toEqual({ Aisha: 30, Ben: 30 });
    // A payback before then lowers the bill, with no transfer yet.
    pay('s1', 'dinner', 'aisha', 'me', 30, '2026-11-13T08:00:00.000Z');
    projectGroup(GROUP, env);
    expect(liveTransactions()).toEqual([{ id: 'dinner', type: 'expense', amount: 60 }]);
    expect(projectGroup(GROUP, env)).toBe(false);

    // Given one from the editor: the account it left, and the payback's
    // transfer to the payback account follows.
    projectGroup(GROUP, env, { expenseId: 'dinner', hints: { entry: { accountId: 'cash' } } });
    expect(tx('dinner')).toMatchObject({ amount: 60, account_id: 'cash' });
    expect(tx('dinner:t:s1')).toMatchObject({ from_account_id: 'cash', to_account_id: 'bank' });
    // An edit someone else makes later keeps the account the user gave it.
    addBill('dinner', 'me', 120, 'u-aisha');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 90, account_id: 'cash' });
  });

  it('a bill the user saved from another phone of theirs lands on their account', () => {
    addBill('dinner', 'me', 90, 'u-me');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ account_id: 'cash' });
  });

  it('turned into one the user paid by someone else, it waits for the account too', () => {
    addBill('dinner', 'aisha');
    projectGroup(GROUP, env);
    addBill('dinner', 'me', 90, 'u-aisha');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ amount: 90, account_id: null });
  });

  it('a change the user made on another phone waits for that phone’s account, not the default', () => {
    addBill('dinner', 'me', 90, 'u-aisha');
    projectGroup(GROUP, env);
    // Confirmed on the other phone: the group row says the user wrote it
    // last, but the entry's account has not come over yet.
    addBill('dinner', 'me', 90, 'u-me');
    projectGroup(GROUP, env);
    expect(tx('dinner')).toMatchObject({ account_id: null });
  });

  it('an account picked in the editor works its account amount out afresh', () => {
    const usd = { ...env, currencyOf: (id: string) => (id === 'usd' ? 'USD' : 'MYR') };
    usd.rateTable = { base: 'MYR', rates: { MYR: 1, USD: 0.25 }, asOfDate: null };
    addBill('dinner', 'me');
    projectGroup(GROUP, usd);
    expect(tx('dinner')).toMatchObject({ account_id: 'cash' });
    projectGroup(GROUP, usd, { expenseId: 'dinner', hints: { entry: { accountId: 'usd' } } });
    expect(
      app.all('SELECT account_id, account_amount FROM transactions WHERE id = ?', 'dinner')[0],
    ).toEqual({ account_id: 'usd', account_amount: 22.5 });
  });

  it('a bill the user only owed on, deleted by someone else, goes', () => {
    addBill('dinner', 'aisha');
    projectGroup(GROUP, env);
    albumGroupsRepository.softDeleteExpense(GROUP, 'dinner', 'u-aisha');
    projectGroup(GROUP, env);
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

describe('payments recorded as one act', () => {
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
      shares: Object.entries(owes).map(([memberId, amount]) => ({ memberId, amount })),
      createdBy: 'u-me',
    });
  const live = () => albumGroupsRepository.listSettlements(GROUP).filter((s) => !s.deletedAt);

  it('undoing one of them undoes them all, so nobody’s total moves', () => {
    add('dinner', 'me', { me: 30, aisha: 30 });
    add('boat', 'ben', { ben: 30, me: 30 });
    const [first, second] = albumGroupsRepository.createSettlements(
      GROUP,
      [
        { expenseId: 'dinner', fromMember: 'aisha', toMember: 'me', amount: 30, currency: 'MYR' },
        { expenseId: 'boat', fromMember: 'me', toMember: 'ben', amount: 30, currency: 'MYR' },
      ],
      { date: '2026-11-13', createdBy: 'u-aisha' },
    );
    projectGroup(GROUP, env);
    expect(balances()).toEqual({ Aisha: 0, Ben: 0 });
    // Undone from the dinner alone: the boat's goes with it.
    albumGroupsRepository.softDeleteSettlement(GROUP, first);
    expect(live()).toEqual([]);
    expect(second.split('.')[0]).toBe(first.split('.')[0]);
    projectGroup(GROUP, env);
    expect(balances()).toEqual({ Aisha: 30, Ben: -30 });
    // A payment on its own is undone on its own.
    pay('solo', 'dinner', 'aisha', 'me', 5, '2026-11-13T08:00:00.000Z');
    pay('other', 'boat', 'me', 'ben', 5, '2026-11-13T09:00:00.000Z');
    albumGroupsRepository.softDeleteSettlement(GROUP, 'solo');
    expect(live().map((s) => s.id)).toEqual(['other']);
  });

  it('closes a group that has come out even, only with Simplify on', () => {
    // A circle: Aisha owes the user, the user owes Ben, Ben owes Aisha.
    add('dinner', 'me', { aisha: 10 });
    add('boat', 'ben', { me: 10 });
    add('taxi', 'aisha', { ben: 10 });
    projectGroup(GROUP, env);
    expect(closeEvenGroup(GROUP, env)).toBe(false);
    albumGroupsRepository.setSimplifyDebts(GROUP, true);
    expect(closeEvenGroup(GROUP, env)).toBe(true);
    projectGroup(GROUP, env);
    expect(balances()).toEqual({ Aisha: 0, Ben: 0 });
    expect(live()).toHaveLength(3);
    // Nothing left to close; and a group with a real debt is left alone.
    expect(closeEvenGroup(GROUP, env)).toBe(false);
    add('hotel', 'me', { me: 50, ben: 50 });
    expect(closeEvenGroup(GROUP, env)).toBe(false);
  });
});

describe('sharing and its end', () => {
  it('brings back an album deleted here when it is joined again', () => {
    app.connection.exec(`UPDATE albums SET deleted_at = '${NOW}' WHERE id = '${GROUP}'`);
    expect(isAlbumDeleted(GROUP)).toBe(true);
    ensureLocalAlbum({ ledgerId: GROUP, name: 'Bali trip' });
    expect(isAlbumDeleted(GROUP)).toBe(false);
    expect(albumLedgerId(GROUP)).toBe('default');
    expect(app.all('SELECT COUNT(*) AS n FROM albums')[0].n).toBe(1);
  });

  it('puts a joined album in the main ledger, whichever ledger is open', () => {
    setActiveLedgerId('work');
    try {
      ensureLocalAlbum({ ledgerId: 'tokyo', name: 'Tokyo' });
    } finally {
      setActiveLedgerId(DEFAULT_LEDGER_ID);
    }
    expect(albumLedgerId('tokyo')).toBe(DEFAULT_LEDGER_ID);
    // A shared album needs the main ledger to be the user's alone.
    expect(mainLedgerTakesSharedAlbums()).toBe(true);
    saveSharedLedger({
      ledgerId: DEFAULT_LEDGER_ID,
      shareId: 'share-main',
      role: 'owner',
      name: 'Main',
      ownerName: 'Nelson',
      memberCount: 2,
      active: true,
      userId: 'u-me',
      ownerUserId: 'u-me',
      kind: 'ledger',
    });
    expect(mainLedgerTakesSharedAlbums()).toBe(false);
    removeSharedLedger(DEFAULT_LEDGER_ID);
  });

  it('gives the album back as the user’s own when sharing ends', () => {
    addBill('dinner', 'me');
    projectGroup(GROUP, env);
    removeSharedLedger(GROUP);
    releaseAlbumGroup(GROUP, 'u-me');
    expect(app.all('SELECT COUNT(*) AS n FROM album_expenses')[0].n).toBe(0);
    expect(app.all('SELECT COUNT(*) AS n FROM album_members')[0].n).toBe(0);
    expect(tx('dinner').album_group_id).toBeNull();
    // The entries stay, as ordinary split bills.
    expect(balances()).toEqual({ Aisha: 30, Ben: 30 });
  });
});

// Anyone in a shared album writes its group's rows straight into the group's
// database, so every row is read as if someone hostile wrote it.
describe('rows another member wrote are not trusted', () => {
  const rawBill = (id: string, fields: { amount?: string; date?: string; shares?: string }) =>
    app.connection.exec(`
      INSERT INTO album_expenses (id, ledger_id, date, note, amount, currency, paid_by, shares_json, created_at, updated_at)
        VALUES ('${id}', '${GROUP}', '${fields.date ?? '2026-11-12'}', 'Dinner', ${fields.amount ?? '90'}, 'MYR', 'aisha',
          '${fields.shares ?? '[{"memberId":"me","amount":30},{"memberId":"aisha","amount":60}]'}', '${NOW}', '${NOW}');
    `);
  const addOwnIncome = () =>
    app.connection.exec(`
      INSERT INTO transactions (id, ledger_id, type, amount, currency, reporting_currency, reporting_amount, fx_rate, date, account_id, category_id, note, created_at, updated_at)
        VALUES ('salary', 'default', 'income', 5000, 'MYR', 'MYR', 5000, 1, '2026-11-01', 'bank', 'pay', 'Salary', '${NOW}', '${NOW}');
    `);

  it('a bill named after one of the user’s own entries leaves that entry alone', () => {
    addOwnIncome();
    rawBill('salary', {});
    expect(projectGroup(GROUP, env)).toBe(false);
    expect(tx('salary')).toMatchObject({ type: 'income', amount: 5000, album_group_id: null });
    expect(transactionSplitsRepository.listByTransactionId('salary')).toEqual([]);
    // Nor does deleting that bill take the entry with it.
    albumGroupsRepository.softDeleteExpense(GROUP, 'salary', 'u-aisha');
    expect(projectGroup(GROUP, env)).toBe(false);
    expect(tx('salary')).toMatchObject({ amount: 5000, deleted_at: null });
  });

  it('a group joined again takes back the entries it left in the album', () => {
    addBill('dinner', 'aisha');
    projectGroup(GROUP, env);
    // Left: the entry stays, as the user's own, in the album.
    app.connection.exec(`UPDATE transactions SET album_group_id = NULL WHERE id = 'dinner'`);
    expect(projectGroup(GROUP, env)).toBe(true);
    expect(tx('dinner')).toMatchObject({ amount: 30, album_group_id: GROUP });
    expect(liveTransactions().map((row) => row.id)).toEqual(['dinner']);
  });

  it('leaves out rows this app would never have written, and settles', () => {
    addBill('dinner', 'aisha');
    rawBill('text-amount', { amount: `'abc'` });
    rawBill('huge', { amount: '1e308' });
    rawBill('negative', { amount: '-5' });
    rawBill('no-day', { date: '9999-99-99' });
    rawBill('odd%id', {});
    rawBill('huge-share', { shares: '[{"memberId":"me","amount":1e308}]' });
    rawBill('not-json', { shares: 'nope' });
    // A day stamped with a time (a balance adjustment) is read as its day.
    rawBill('stamped', { date: '2026-11-12T08:00:00.000Z' });
    // A share of somebody who is not in the group is dropped; the bill stays.
    rawBill('stranger', {
      shares: '[{"memberId":"me","amount":30},{"memberId":"ghost","amount":60}]',
    });
    app.connection.exec(`
      INSERT INTO album_members (id, ledger_id, name, sort_order, created_at, updated_at)
        VALUES ('blank', '${GROUP}', '   ', 9, '${NOW}', '${NOW}');
      INSERT INTO album_settlements (id, ledger_id, expense_id, from_member, to_member, amount, currency, date, created_at, updated_at)
        VALUES ('text-pay', '${GROUP}', 'dinner', 'me', 'aisha', 'abc', 'MYR', '2026-11-13', '${NOW}', '${NOW}'),
               ('ghost-pay', '${GROUP}', 'dinner', 'me', 'ghost', 5, 'MYR', '2026-11-13', '${NOW}', '${NOW}'),
               ('bad-day', '${GROUP}', 'dinner', 'me', 'aisha', 5, 'MYR', 'yesterday', '${NOW}', '${NOW}');
    `);
    expect(
      albumGroupsRepository
        .listExpenses(GROUP)
        .map((bill) => [bill.id, bill.shares.length])
        .sort(),
    ).toEqual([
      ['dinner', 3],
      ['stamped', 2],
      ['stranger', 1],
    ]);
    expect(
      albumGroupsRepository.listExpenses(GROUP).find((bill) => bill.id === 'stamped')?.date,
    ).toBe('2026-11-12');
    expect(albumGroupsRepository.listSettlements(GROUP)).toEqual([]);
    expect(albumGroupsRepository.listMembers(GROUP).map((member) => member.id)).toEqual([
      'me',
      'aisha',
      'ben',
    ]);
    expect(projectGroup(GROUP, env)).toBe(true);
    expect(tx('dinner')).toMatchObject({ amount: 30 });
    // Nothing keeps it writing: the next pass has nothing to do.
    expect(projectGroup(GROUP, env)).toBe(false);
    expect(openShares(albumGroupsRepository.listExpenses(GROUP), []).length).toBe(4);
  });

  it('undoing a payment reaches no other payment, in this group or another', () => {
    addBill('dinner', 'aisha');
    pay('b1.0', 'dinner', 'me', 'aisha', 5, '2026-11-13T08:00:00.000Z');
    pay('b1.1', 'dinner', 'ben', 'aisha', 5, '2026-11-13T08:00:00.000Z');
    pay('b10.0', 'dinner', 'me', 'aisha', 5, '2026-11-13T08:00:00.000Z');
    // A payment whose id reads as a pattern.
    pay('%.0', 'dinner', 'me', 'aisha', 1, '2026-11-13T08:00:00.000Z');
    app.connection.exec(`
      INSERT INTO album_settlements (id, ledger_id, expense_id, from_member, to_member, amount, currency, date, created_at, updated_at)
        VALUES ('b1.2', 'tokyo', 'ramen', 'x', 'y', 5, 'JPY', '2026-11-13', '${NOW}', '${NOW}');
    `);
    const live = () =>
      app
        .all('SELECT id FROM album_settlements WHERE deleted_at IS NULL ORDER BY id')
        .map((row) => row.id);
    albumGroupsRepository.softDeleteSettlement(GROUP, '%.0');
    expect(live()).toEqual(['b1.0', 'b1.1', 'b1.2', 'b10.0']);
    // The batch, in this group only, and not the batch whose name starts the same.
    albumGroupsRepository.softDeleteSettlement(GROUP, 'b1.1');
    expect(live()).toEqual(['b1.2', 'b10.0']);
    // Another group's row is out of reach by its id.
    albumGroupsRepository.softDeleteSettlement(GROUP, 'b1.2');
    albumGroupsRepository.softDeleteExpense(GROUP, 'ramen', 'u-aisha');
    expect(live()).toEqual(['b1.2', 'b10.0']);
  });

  it('letting a group go never deletes a ledger that shares its id', () => {
    app.connection.exec(`
      INSERT INTO ledgers (id, name, sort_order, created_at, updated_at)
        VALUES ('${GROUP}', 'Work', 1, '${NOW}', '${NOW}');
      INSERT INTO transactions (id, ledger_id, type, amount, currency, date, created_at, updated_at)
        VALUES ('work-1', '${GROUP}', 'expense', 12, 'MYR', '2026-11-10', '${NOW}', '${NOW}');
    `);
    addBill('dinner', 'aisha');
    removeSharedLedger(GROUP);
    releaseAlbumGroup(GROUP, 'u-me');
    expect(app.all('SELECT COUNT(*) AS n FROM album_expenses')[0].n).toBe(0);
    expect(app.all('SELECT id FROM ledgers WHERE id = ?', GROUP)).toEqual([{ id: GROUP }]);
    expect(tx('work-1')).toMatchObject({ amount: 12, deleted_at: null });
  });
});
