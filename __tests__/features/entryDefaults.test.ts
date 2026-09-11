import { pickDefaultAccountId } from '~/features/transactions/lib/entryDefaults';
import type { Account } from '~/types';

const accounts = [
  { id: 'cash', name: 'Cash', sortOrder: 0 },
  { id: 'wallet', name: 'Simple Wallet', sortOrder: 1 },
] as Account[];
describe('entry account defaults after mode conversion', () => {
  it('keeps the former wallet when conversion saved it as the default', () => {
    expect(pickDefaultAccountId(accounts, 'wallet')).toBe('wallet');
  });

  it('respects a different account chosen after conversion', () => {
    expect(pickDefaultAccountId(accounts, 'cash')).toBe('cash');
  });

  it('uses imported accounts when the former wallet is absent', () => {
    expect(pickDefaultAccountId(accounts.slice(0, 1), 'missing-wallet')).toBe('cash');
  });

  it('does not identify accounts by a former wallet name', () => {
    expect(pickDefaultAccountId(accounts)).toBe('cash');
  });

  it('leaves entry unavailable when no account exists', () => {
    expect(pickDefaultAccountId([], 'missing-wallet')).toBeNull();
  });
});
