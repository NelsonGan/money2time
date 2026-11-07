import type { Account } from '~/types';

type ArchivableAccount = Pick<Account, 'type'> &
  Partial<Pick<Account, 'archivedAt' | 'loanArchivedAt' | 'goalArchivedAt'>>;

/**
 * Whether an account is archived: hidden from the accounts stack, the account
 * pickers and the defaults new entries fall back to, with its transactions
 * kept. Everyday (debit and credit) accounts archive through `archivedAt`;
 * loans and goals kept the stamps they had before (`loanArchivedAt`,
 * `goalArchivedAt`), which older app versions and the Web Dashboard read, so
 * this is the one place that knows all three.
 */
export function isAccountArchived(account: ArchivableAccount): boolean {
  if (account.archivedAt != null) return true;
  if (account.type === 'loan') return account.loanArchivedAt != null;
  if (account.type === 'goal') return account.goalArchivedAt != null;
  return false;
}
