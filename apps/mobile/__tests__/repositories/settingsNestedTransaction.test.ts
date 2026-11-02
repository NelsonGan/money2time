/**
 * Auto-log saves its usage counter inside the transaction that creates the
 * transaction row. With a non-default ledger open the settings write also
 * needs a transaction, and SQLite cannot BEGIN inside a BEGIN (PostHog issue
 * 01a19185: "cannot start a transaction within a transaction").
 */
const mockSqlite = {
  inTransaction: false,
  isInTransactionSync: () => mockSqlite.inTransaction,
  withTransactionSync: (task: () => void) => {
    if (mockSqlite.inTransaction) {
      throw new Error('cannot start a transaction within a transaction');
    }
    mockSqlite.inTransaction = true;
    try {
      task();
    } finally {
      mockSqlite.inTransaction = false;
    }
  },
};

jest.mock('~/lib/db/client', () => ({
  getDb: jest.fn(),
  getSQLite: () => mockSqlite,
}));
jest.mock('~/lib/repositories/ledgersRepository', () => ({
  ledgersRepository: { update: jest.fn(), updatePrefs: jest.fn(), getPrefs: jest.fn() },
}));

import { getDb } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, setActiveLedgerId } from '~/lib/db/ledgerScope';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';

const mockedGetDb = getDb as jest.Mock;
const ledgers = ledgersRepository as jest.Mocked<typeof ledgersRepository>;

function fakeDb(rows: unknown[]) {
  const writes: Record<string, unknown>[] = [];
  const builder = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    update: () => builder,
    set: (values: Record<string, unknown>) => {
      writes.push(values);
      return builder;
    },
    run: () => undefined,
    get: () => rows.shift(),
  };
  mockedGetDb.mockReturnValue(builder);
  return writes;
}

describe('settings writes inside an outer transaction', () => {
  beforeEach(() => setActiveLedgerId('work'));
  afterEach(() => {
    setActiveLedgerId(DEFAULT_LEDGER_ID);
    mockSqlite.inTransaction = false;
    jest.clearAllMocks();
  });

  it('saves quick-entry prefs for a non-default ledger inside an auto-log transaction', () => {
    const writes = fakeDb([{ quickEntryPrefsJson: '{"voiceUsageCount":1}' }]);
    const prefs = JSON.stringify({ defaultAccountId: 'w1', autoLogUsageCount: 3 });

    expect(() =>
      mockSqlite.withTransactionSync(() => settingsRepository.updateQuickEntryPrefsJson(prefs)),
    ).not.toThrow();

    expect(ledgers.updatePrefs).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
  });

  it('saves payment-alert prefs for a non-default ledger inside an outer transaction', () => {
    const writes = fakeDb([{ autoLogPrefsJson: null }]);
    const prefs = JSON.stringify({ sources: {} });

    expect(() =>
      mockSqlite.withTransactionSync(() => settingsRepository.updateAutoLogPrefsJson(prefs)),
    ).not.toThrow();

    expect(ledgers.updatePrefs).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
  });

  it('still opens its own transaction when called on its own', () => {
    fakeDb([{ quickEntryPrefsJson: null }]);
    const spy = jest.spyOn(mockSqlite, 'withTransactionSync');

    settingsRepository.updateQuickEntryPrefsJson('{"autoLogUsageCount":1}');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
