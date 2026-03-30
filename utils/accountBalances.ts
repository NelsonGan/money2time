import type { AccountType } from '~/types';

export function getNetAssetContribution(accountType: AccountType, balance: number) {
  return accountType === 'credit' ? -balance : balance;
}
