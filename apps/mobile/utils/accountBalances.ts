import type { AccountType } from '~/types';

/**
 * Account types that represent money owed rather than money held. Their
 * balance is a positive debt figure, so it subtracts from net worth and the
 * balance formula flips (spending raises it, paying it down lowers it).
 *
 * Note this is deliberately *not* the same predicate as `type === 'credit'`:
 * that one gates credit-card-only machinery (statement cycles, payable vs
 * outstanding, "pay this card"), which a loan has no equivalent of.
 */
export function isLiabilityAccountType(accountType: AccountType): boolean {
  return accountType === 'credit' || accountType === 'loan';
}

/**
 * Whether a balance correction records as income or as spending. On a
 * liability a rising balance is more debt, so it records as spending.
 */
export function flowTypeForBalanceDelta(
  accountType: AccountType,
  delta: number,
): 'income' | 'expense' {
  if (isLiabilityAccountType(accountType)) return delta >= 0 ? 'expense' : 'income';
  return delta >= 0 ? 'income' : 'expense';
}

export function getNetAssetContribution(accountType: AccountType, balance: number) {
  return isLiabilityAccountType(accountType) ? -balance : balance;
}

export interface AccountBalanceParts {
  type: AccountType;
  startingBalance: number;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
  adjustments: number;
}

/**
 * An account's balance from its bucketed transaction totals.
 *
 * Assets hold what you have; liabilities (credit cards, loans) hold a positive
 * figure for what you owe, so the signs flip: spending on the account raises
 * the debt and money paid into it lowers the debt. That single flip is what
 * lets a loan reuse the credit card's arithmetic unchanged, with a repayment
 * modelled as an ordinary transfer into the account.
 */
export function computeAccountBalance(parts: AccountBalanceParts): number {
  const { startingBalance, income, expense, transfersIn, transfersOut, adjustments } = parts;
  return isLiabilityAccountType(parts.type)
    ? startingBalance + expense + transfersOut - income - transfersIn + adjustments
    : startingBalance + income + transfersIn - expense - transfersOut + adjustments;
}
