import type { Account, PaymentAlertSource } from '~/types';

export interface AccountBinding {
  accountId: string | null;
  certainty: 'certain' | 'none';
  reason: 'preset' | 'source_single' | 'none';
}

export interface BindingInput {
  presetAccountId: string | null;
  source: PaymentAlertSource | null;
  accounts: readonly Account[];
}

export function isPayableAccount(account: Account): boolean {
  return !account.deletedAt && account.type !== 'goal' && account.type !== 'loan';
}

/** Only an account explicitly selected for this app or automation may be used. */
export function bindAccount(input: BindingInput): AccountBinding {
  const payable = input.accounts.filter(isPayableAccount);
  const selectedId = input.presetAccountId ?? input.source?.accountId;
  const selected = payable.find((account) => account.id === selectedId);
  return {
    accountId: selected?.id ?? null,
    certainty: selected ? 'certain' : 'none',
    reason: selected ? (input.presetAccountId ? 'preset' : 'source_single') : 'none',
  };
}
