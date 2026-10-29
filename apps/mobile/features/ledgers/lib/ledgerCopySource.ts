import { withLedgerScope } from '~/lib/db/ledgerScope';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';

/** What a new ledger would get from copying `ledgerId`, for the editor's captions. */
export interface LedgerCopySource {
  /** Everyday accounts (debit and credit): what "Accounts" copies. */
  accounts: number;
  categories: number;
  /** The source's currency: an "Everything" copy keeps it. */
  currency: { code: string; symbol: string };
}

/** Read any ledger's copyable counts and currency, whichever ledger is open. */
export function readLedgerCopySource(ledgerId: string): LedgerCopySource {
  return withLedgerScope(ledgerId, () => ({
    accounts: accountsRepository
      .list()
      .filter((account) => account.type === 'debit' || account.type === 'credit').length,
    categories: categoriesRepository.list().length,
    currency: ledgersRepository.activeReportingCurrency(),
  }));
}
