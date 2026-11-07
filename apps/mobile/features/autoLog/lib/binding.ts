import type {
  Account,
  AccountBindingCertainty,
  AccountBindingReason,
  PaymentAlertSource,
} from '~/types';
import { isAccountArchived } from '~/utils/accountArchive';

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

/**
 * Whether a payment alert may post to an account. An archived card is not:
 * a source still bound to it falls back to asking, rather than filing new
 * entries where the user can no longer see them.
 */
export function isPayableAccount(account: Account): boolean {
  return (
    !account.deletedAt &&
    account.type !== 'goal' &&
    account.type !== 'loan' &&
    !isAccountArchived(account)
  );
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
    identifier: null,
    candidateAccountIds: selected ? [selected.id] : [],
  };
}
