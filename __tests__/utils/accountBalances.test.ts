import type { AccountType } from '~/types';
import {
  type AccountBalanceParts,
  computeAccountBalance,
  getNetAssetContribution,
  isLiabilityAccountType,
} from '~/utils/accountBalances';

describe('getNetAssetContribution', () => {
  it('returns the positive balance for debit accounts', () => {
    expect(getNetAssetContribution('debit', 250)).toBe(250);
    expect(getNetAssetContribution('debit', -50)).toBe(-50);
  });

  it('negates the balance for credit accounts (they reduce net worth)', () => {
    expect(getNetAssetContribution('credit', 250)).toBe(-250);
    expect(getNetAssetContribution('credit', -50)).toBe(50);
  });

  it('negates the balance for loan accounts (they reduce net worth)', () => {
    expect(getNetAssetContribution('loan', 42180)).toBe(-42180);
    // An overpaid loan is a small asset, not a debt.
    expect(getNetAssetContribution('loan', -120)).toBe(120);
  });

  it('treats a savings goal as an asset', () => {
    expect(getNetAssetContribution('goal', 1000)).toBe(1000);
  });
});

describe('isLiabilityAccountType', () => {
  it('classifies credit and loan as liabilities', () => {
    expect(isLiabilityAccountType('credit')).toBe(true);
    expect(isLiabilityAccountType('loan')).toBe(true);
  });

  it('classifies debit and goal as assets', () => {
    expect(isLiabilityAccountType('debit')).toBe(false);
    expect(isLiabilityAccountType('goal')).toBe(false);
  });
});

describe('computeAccountBalance', () => {
  const parts = (type: AccountType, over: Partial<AccountBalanceParts> = {}) => ({
    type,
    startingBalance: 0,
    income: 0,
    expense: 0,
    transfersIn: 0,
    transfersOut: 0,
    adjustments: 0,
    ...over,
  });

  it('adds what came in and subtracts what went out for an asset', () => {
    expect(
      computeAccountBalance(
        parts('debit', {
          startingBalance: 1000,
          income: 500,
          expense: 200,
          transfersIn: 50,
          transfersOut: 100,
        }),
      ),
    ).toBe(1250);
  });

  it('flips the signs for a credit card', () => {
    // Spending on a card raises the debt; paying it in lowers the debt.
    expect(computeAccountBalance(parts('credit', { startingBalance: 500, expense: 200 }))).toBe(
      700,
    );
    expect(computeAccountBalance(parts('credit', { startingBalance: 500, transfersIn: 300 }))).toBe(
      200,
    );
  });

  it('treats a loan exactly like a credit card', () => {
    // This is the whole reason a loan needs no new balance code: a repayment
    // is an ordinary transfer into the account.
    expect(
      computeAccountBalance(parts('loan', { startingBalance: 42180, transfersIn: 1250 })),
    ).toBe(40930);
    // An interest charge is spending on the loan, so the debt grows.
    expect(computeAccountBalance(parts('loan', { startingBalance: 42180, expense: 158 }))).toBe(
      42338,
    );
    // A drawdown moves money out of the loan into a bank account.
    expect(computeAccountBalance(parts('loan', { startingBalance: 1000, transfersOut: 400 }))).toBe(
      1400,
    );
  });

  it('lets a loan repayment take the balance below zero (an overpayment)', () => {
    expect(computeAccountBalance(parts('loan', { startingBalance: 100, transfersIn: 150 }))).toBe(
      -50,
    );
  });

  it('treats a savings goal as an asset', () => {
    expect(computeAccountBalance(parts('goal', { startingBalance: 250, transfersIn: 500 }))).toBe(
      750,
    );
  });

  it('applies a balance adjustment in the account`s own direction', () => {
    // On an asset the adjustment adds; on a liability it also adds, because
    // the stored figure is the debt itself.
    expect(computeAccountBalance(parts('debit', { adjustments: 25 }))).toBe(25);
    expect(computeAccountBalance(parts('loan', { adjustments: 25 }))).toBe(25);
  });
});
