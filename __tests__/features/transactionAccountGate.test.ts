import {
  countActiveAccounts,
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
  it('allows five active accounts but blocks a free user with six', () => {
    expect(isNewTransactionBlockedByAccounts(false, 5)).toBe(false);
    expect(isNewTransactionBlockedByAccounts(false, 6)).toBe(true);
    expect(isNewTransactionBlockedByAccounts(true, 6)).toBe(false);
  });

  it('counts goals and loans only while active, and ignores deleted accounts', () => {
    const accounts = [
      account('wallet'),
      account('credit', { type: 'credit' }),
      account('hidden', { includeInTotals: false }),
      account('goal', { type: 'goal', goalArchivedAt: null }),
      account('loan', { type: 'loan', loanArchivedAt: null }),
      account('archived-goal', {
        type: 'goal',
        goalArchivedAt: '2026-09-01T00:00:00.000Z',
      }),
      account('archived-loan', {
        type: 'loan',
        loanArchivedAt: '2026-09-01T00:00:00.000Z',
      }),
      account('deleted', { deletedAt: '2026-09-01T00:00:00.000Z' }),
    ];

    expect(countActiveAccounts(accounts)).toBe(5);
    expect(countActiveAccounts([...accounts, account('sixth')])).toBe(6);
  });

  it('restores free transaction entry when an excess loan is archived', () => {
    const active = [
      ...Array.from({ length: 5 }, (_, index) => account(`bank-${index}`)),
      account('loan', { type: 'loan', loanArchivedAt: null }),
    ];
    expect(isNewTransactionBlockedByAccounts(false, countActiveAccounts(active))).toBe(true);

    const archived = active.map((item) =>
      item.id === 'loan' ? { ...item, loanArchivedAt: '2026-09-01T00:00:00.000Z' } : item,
    );
    expect(isNewTransactionBlockedByAccounts(false, countActiveAccounts(archived))).toBe(false);
  });
});
