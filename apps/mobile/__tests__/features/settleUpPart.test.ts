import { planPartSettlement } from '~/features/transactions/lib/settleUp';
import type { DebtDirection, PersonDebtBill } from '~/types';

function bill(
  splitId: string,
  direction: DebtDirection,
  amount: number,
  overrides: Partial<PersonDebtBill> = {},
): PersonDebtBill {
  return {
    splitId,
    direction,
    transactionId: `tx-${splitId}`,
    date: '2026-11-12',
    amount,
    currency: 'MYR',
    reportingAmount: amount,
    note: null,
    categoryName: null,
    categoryIcon: null,
    paybackAccountId: null,
    paidAt: null,
    shareTotal: amount,
    sharePaid: 0,
    shareKey: splitId,
    ...overrides,
  };
}

describe('settling part of what is between two people', () => {
  it('pays the oldest open bills of whoever pays on balance, as far as it reaches', () => {
    const person = {
      netReporting: 50,
      netByCurrency: [{ currency: 'MYR', amount: 50 }],
      bills: [
        bill('late', 'owes_you', 30, { date: '2026-11-14' }),
        bill('early', 'owes_you', 30, { date: '2026-11-10' }),
        // What the user owes them is left alone, and so is what is paid.
        bill('mine', 'you_owe', 10),
        bill('done', 'owes_you', 99, { paidAt: '2026-11-11T00:00:00.000Z' }),
      ],
    };
    expect(planPartSettlement(person, 40)).toEqual([
      { splitId: 'early', direction: 'owes_you', amount: 30 },
      { splitId: 'late', direction: 'owes_you', amount: 10 },
    ]);
    expect(planPartSettlement(person, 0)).toEqual([]);
  });

  it('pays the user’s own debts when they owe on balance', () => {
    const person = {
      netReporting: -25,
      netByCurrency: [{ currency: 'MYR', amount: -25 }],
      bills: [bill('boat', 'you_owe', 40), bill('theirs', 'owes_you', 15)],
    };
    expect(planPartSettlement(person, 12.5)).toEqual([
      { splitId: 'boat', direction: 'you_owe', amount: 12.5 },
    ]);
  });

  it('takes an amount in the reporting currency when the bills are in several', () => {
    // $10 (RM40 here) and RM30 owed to the user: RM50 of the RM70 is paid.
    const person = {
      netReporting: 70,
      netByCurrency: [
        { currency: 'USD', amount: 10 },
        { currency: 'MYR', amount: 30 },
      ],
      bills: [
        bill('usd', 'owes_you', 10, { currency: 'USD', reportingAmount: 40, date: '2026-11-10' }),
        bill('myr', 'owes_you', 30, { date: '2026-11-11' }),
      ],
    };
    expect(planPartSettlement(person, 50)).toEqual([
      { splitId: 'usd', direction: 'owes_you', amount: 10 },
      { splitId: 'myr', direction: 'owes_you', amount: 10 },
    ]);
    expect(planPartSettlement(person, 20)).toEqual([
      { splitId: 'usd', direction: 'owes_you', amount: 5 },
    ]);
  });
});
