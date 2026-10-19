import { stackPaletteIndex } from '~/features/settings/lib/cardStackIndex';
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
    ...overrides,
  } as Account;
}

describe('stackPaletteIndex', () => {
  const accounts = [
    account('cash', { accountGroup: 'Cash' }),
    account('goal', { type: 'goal', accountGroup: 'Cash' }),
    account('wallet', { accountGroup: 'Cash' }),
    account('bank', { accountGroup: 'Banks' }),
    account('old-loan', { type: 'loan', accountGroup: 'Cash', loanArchivedAt: '2026-01-01' }),
    account('loose'),
  ];

  it('counts only live cards in the same group, in list order', () => {
    expect(stackPaletteIndex('cash', 'Cash', accounts)).toBe(0);
    // The goal before it lives on its own rail and does not take a colour.
    expect(stackPaletteIndex('wallet', 'Cash', accounts)).toBe(1);
    expect(stackPaletteIndex('bank', 'Banks', accounts)).toBe(0);
    expect(stackPaletteIndex('loose', null, accounts)).toBe(0);
  });

  it('puts an account being created at the end of the group it is going into', () => {
    expect(stackPaletteIndex(null, ' Cash ', accounts)).toBe(2);
    expect(stackPaletteIndex(null, 'New group', accounts)).toBe(0);
  });

  it('counts archived loans in their own section', () => {
    expect(stackPaletteIndex('old-loan', 'Cash', accounts, true)).toBe(0);
  });
});
