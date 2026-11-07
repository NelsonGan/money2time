import type { Account } from '~/types';
import { isAccountArchived } from '~/utils/accountArchive';

const AT = '2026-11-07T00:00:00.000Z';

function account(overrides: Partial<Account>): Pick<Account, 'type'> & Partial<Account> {
  return { type: 'debit', ...overrides };
}

describe('isAccountArchived', () => {
  it('reads archivedAt on everyday accounts', () => {
    expect(isAccountArchived(account({ type: 'debit' }))).toBe(false);
    expect(isAccountArchived(account({ type: 'debit', archivedAt: AT }))).toBe(true);
    expect(isAccountArchived(account({ type: 'credit', archivedAt: AT }))).toBe(true);
    expect(isAccountArchived(account({ type: 'credit', archivedAt: null }))).toBe(false);
  });

  it('keeps reading the loan and goal stamps those types archive through', () => {
    expect(isAccountArchived(account({ type: 'loan', loanArchivedAt: AT }))).toBe(true);
    expect(isAccountArchived(account({ type: 'goal', goalArchivedAt: AT }))).toBe(true);
    expect(isAccountArchived(account({ type: 'loan' }))).toBe(false);
  });

  it('ignores the stamp of another type', () => {
    expect(isAccountArchived(account({ type: 'debit', loanArchivedAt: AT }))).toBe(false);
    expect(isAccountArchived(account({ type: 'debit', goalArchivedAt: AT }))).toBe(false);
  });
});
