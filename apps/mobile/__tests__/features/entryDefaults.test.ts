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

  it('keeps an explicitly selected account ahead of the saved default', () => {
    expect(pickDefaultAccountId(accounts, 'cash', 'wallet')).toBe('wallet');
  });

  it('uses the saved default when the explicitly selected account was deleted', () => {
    expect(pickDefaultAccountId(accounts, 'wallet', 'deleted-account')).toBe('wallet');
  });

  it('uses the first account by sort order when neither selection exists', () => {
    const reversed = [...accounts].reverse();
    expect(pickDefaultAccountId(reversed, 'deleted-default', 'deleted-account')).toBe('cash');
    expect(reversed.map((account) => account.id)).toEqual(['wallet', 'cash']);
  });
});

describe('entry account defaults with archived accounts', () => {
  const withArchived = [
    { id: 'old-card', name: 'Old card', type: 'credit', sortOrder: 0, archivedAt: '2026-11-07' },
    { id: 'cash', name: 'Cash', type: 'debit', sortOrder: 1 },
    { id: 'old-loan', name: 'Car', type: 'loan', sortOrder: 2, loanArchivedAt: '2026-11-07' },
  ] as Account[];

  it('never falls back to an archived account, even the first by sort order', () => {
    expect(pickDefaultAccountId(withArchived)).toBe('cash');
  });

  it('passes over a saved default the user has since archived', () => {
    expect(pickDefaultAccountId(withArchived, 'old-card')).toBe('cash');
    expect(pickDefaultAccountId(withArchived, 'old-loan')).toBe('cash');
  });

  it('still honours an archived account chosen explicitly for this entry', () => {
    expect(pickDefaultAccountId(withArchived, 'cash', 'old-card')).toBe('old-card');
  });

  it('leaves entry unavailable when every account is archived', () => {
    expect(pickDefaultAccountId(withArchived.slice(0, 1))).toBeNull();
  });
});
