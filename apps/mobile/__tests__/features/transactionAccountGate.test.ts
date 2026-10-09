import {
  countAccountsTowardFreeLimit,
  isNewTransactionBlockedByAccounts,
} from '~/features/transactions/lib/accountEntryGate';
import type { Account } from '~/types';

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    name: id,
    type: 'debit',
    accountGroup: null,
    creditStatementDay: null,
    creditDueDay: null,
    currency: 'USD',
    startingBalance: 0,
    includeInTotals: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('new transaction account gate', () => {
  it('allows transactions with six accounts but blocks a free user with seven', () => {
    expect(isNewTransactionBlockedByAccounts(false, 6)).toBe(false);
    expect(isNewTransactionBlockedByAccounts(false, 7)).toBe(true);
    expect(isNewTransactionBlockedByAccounts(true, 7)).toBe(false);
  });

  it('keeps savings goals out of the account limit and excludes deleted accounts', () => {
    const accounts = [
      account('wallet'),
      account('credit', { type: 'credit' }),
      account('hidden', { includeInTotals: false }),
      account('goal', { type: 'goal' }),
      account('archived-goal', { type: 'goal', goalArchivedAt: '2026-09-01T00:00:00.000Z' }),
      account('loan', { type: 'loan' }),
      account('deleted', { deletedAt: '2026-09-01T00:00:00.000Z' }),
    ];

    expect(countAccountsTowardFreeLimit(accounts)).toBe(4);
    expect(countAccountsTowardFreeLimit([...accounts, account('fifth')])).toBe(5);
    expect(countAccountsTowardFreeLimit([...accounts, account('fifth'), account('sixth')])).toBe(6);
  });

  it('does not block a new transaction when goals sit beside six regular accounts', () => {
    const accounts = [
      ...Array.from({ length: 6 }, (_, index) => account(`bank-${index}`)),
      account('goal', { type: 'goal' }),
    ];

    expect(isNewTransactionBlockedByAccounts(false, countAccountsTowardFreeLimit(accounts))).toBe(
      false,
    );
  });

  it('restores free transaction entry when an excess account is removed', () => {
    const active = [
      ...Array.from({ length: 6 }, (_, index) => account(`bank-${index}`)),
      account('excess-bank'),
    ];
    expect(isNewTransactionBlockedByAccounts(false, countAccountsTowardFreeLimit(active))).toBe(
      true,
    );

    const removed = active.map((item) =>
      item.id === 'excess-bank' ? { ...item, deletedAt: '2026-09-01T00:00:00.000Z' } : item,
    );
    expect(isNewTransactionBlockedByAccounts(false, countAccountsTowardFreeLimit(removed))).toBe(
      false,
    );
  });
});
