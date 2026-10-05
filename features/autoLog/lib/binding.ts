import type {
  Account,
  AccountBindingCertainty,
  AccountBindingReason,
  PaymentAlertSource,
} from '~/types';

export interface AccountBinding {
  accountId: string | null;
  certainty: AccountBindingCertainty;
  reason: AccountBindingReason;
  identifier: string | null;
  candidateAccountIds: string[];
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
  const preset = payable.find((account) => account.id === input.presetAccountId);
  const selected = preset ?? payable.find((account) => account.id === input.source?.accountId);
  return {
    accountId: selected?.id ?? null,
    certainty: selected ? 'certain' : 'none',
    reason: preset ? 'preset' : selected ? 'source_single' : 'none',
    identifier: null,
    candidateAccountIds: selected ? [selected.id] : [],
  };
}
