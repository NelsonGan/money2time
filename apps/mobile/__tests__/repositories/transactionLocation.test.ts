import { getDb, getSQLite } from '~/lib/db/client';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';

import { openAppDatabase } from '../helpers/appDatabase';

// A transaction's place through the real repository on real SQLite
// (README: Transaction locations): written whole, kept by edits that do not
// touch it, cleared when the entry stops being an expense or income.

jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn(), getDb: jest.fn() }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: jest.fn() }));
jest.mock('drizzle-orm', () => ({
  ...jest.requireActual('../../node_modules/drizzle-orm/index.cjs'),
  ...jest.requireActual('../../node_modules/drizzle-orm/sqlite-core/index.cjs'),
}));

const STARBUCKS = {
  latitude: 3.1589569,
  longitude: 101.7137273,
  placeName: 'Starbucks',
  placeAddress: '151, Jalan Ampang',
  placeId: 'I88BAA55D81E8BF1',
  placeCategory: 'Cafe',
};
const NONE = {
  latitude: null,
  longitude: null,
  placeName: null,
  placeAddress: null,
  placeId: null,
  placeCategory: null,
};

let app: ReturnType<typeof openAppDatabase>;

beforeEach(() => {
  app = openAppDatabase();
  (getSQLite as jest.Mock).mockReturnValue(app.db);
  (getDb as jest.Mock).mockReturnValue(app.orm);
});

function addExpense(id: string, extra: Record<string, unknown> = {}) {
  transactionsRepository.createWithId(id, {
    type: 'expense',
    amount: 18.5,
    currency: 'MYR',
    date: '2026-11-21T04:00:00.000Z',
    accountId: null,
    categoryId: null,
    note: 'Iced latte',
    ...extra,
  });
}

const placeOf = (id: string) => {
  const row = transactionsRepository.getById(id);
  if (!row) throw new Error(`no transaction ${id}`);
  const { latitude, longitude, placeName, placeAddress, placeId, placeCategory } = row;
  return { latitude, longitude, placeName, placeAddress, placeId, placeCategory };
};

it('saves a place with a new entry and reads it back', () => {
  addExpense('t1', STARBUCKS);
  expect(placeOf('t1')).toEqual(STARBUCKS);
  addExpense('t2');
  expect(placeOf('t2')).toEqual(NONE);
});

it('keeps the place through an edit that does not touch it, and clears it on request', () => {
  addExpense('t1', STARBUCKS);
  transactionsRepository.update('t1', { amount: 21, note: 'Two lattes' });
  expect(placeOf('t1')).toEqual(STARBUCKS);
  transactionsRepository.update('t1', NONE);
  expect(placeOf('t1')).toEqual(NONE);
});

it('never stores half a place or one off the globe', () => {
  addExpense('t1', { ...STARBUCKS, longitude: null });
  expect(placeOf('t1')).toEqual(NONE);
  addExpense('t2', STARBUCKS);
  transactionsRepository.update('t2', { latitude: 120 });
  expect(placeOf('t2')).toEqual(NONE);
});

it('clears the place when the entry becomes a transfer or an adjustment', () => {
  addExpense('t1', STARBUCKS);
  transactionsRepository.update('t1', {
    type: 'transfer',
    fromAccountId: 'a1',
    toAccountId: 'a2',
  });
  expect(placeOf('t1')).toEqual(NONE);

  addExpense('t2', STARBUCKS);
  transactionsRepository.update('t2', { type: 'balance_adjustment' });
  expect(placeOf('t2')).toEqual(NONE);

  // Saving a transfer with a place never stores it either.
  transactionsRepository.createWithId('t3', {
    type: 'transfer',
    amount: 5,
    currency: 'MYR',
    date: '2026-11-21T04:00:00.000Z',
    fromAccountId: 'a1',
    toAccountId: 'a2',
    ...STARBUCKS,
  });
  expect(placeOf('t3')).toEqual(NONE);
});
