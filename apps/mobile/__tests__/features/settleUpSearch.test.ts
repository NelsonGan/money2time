import {
  filterSettleUpPeople,
  filterSettleUpTransactions,
} from '~/features/transactions/lib/settleUpSearch';
import type { PersonDebt, TransactionDebt } from '~/types';

function person(
  name: string,
  note: string,
  categoryName: string,
  paidAt: string | null,
): PersonDebt {
  return {
    key: name.toLowerCase(),
    name,
    totalReporting: paidAt ? 0 : 10,
    paidReporting: paidAt ? 10 : 0,
    byCurrency: [],
    bills: [
      {
        splitId: `${name}-split`,
        transactionId: `${name}-tx`,
        date: '2026-09-24',
        amount: 10,
        currency: 'MYR',
        reportingAmount: 10,
        note,
        categoryName,
        categoryIcon: null,
        paybackAccountId: null,
        paidAt,
      },
    ],
    oldestDate: '2026-09-24',
    billCount: 1,
    unpaidBillCount: paidAt ? 0 : 1,
  };
}

function transaction(
  transactionId: string,
  note: string,
  categoryName: string,
  personName: string,
  paidAt: string | null,
): TransactionDebt {
  return {
    transactionId,
    date: '2026-09-24',
    note,
    categoryName,
    categoryIcon: null,
    currency: 'MYR',
    totalReporting: paidAt ? 0 : 10,
    totalNative: paidAt ? 0 : 10,
    paidNative: paidAt ? 10 : 0,
    latestPaidAt: paidAt,
    splits: [
      {
        splitId: `${transactionId}-split`,
        personName,
        amount: 10,
        currency: 'MYR',
        reportingAmount: 10,
        paybackAccountId: null,
        paidAt,
      },
    ],
    splitCount: 1,
    unpaidSplitCount: paidAt ? 0 : 1,
  };
}

describe('Who owes you search', () => {
  const people = [
    person('Maya', 'Sunday brunch', 'Food', null),
    person('Ezra', 'Cinema tickets', 'Entertainment', '2026-09-27T04:00:00.000Z'),
  ];
  const transactions = [
    transaction('brunch', 'Sunday brunch', 'Food', 'Maya', null),
    transaction('cinema', 'Cinema tickets', 'Entertainment', 'Ezra', '2026-09-27T04:00:00.000Z'),
  ];

  it('shows all entries for an empty or whitespace query', () => {
    expect(filterSettleUpPeople(people, '  ')).toBe(people);
    expect(filterSettleUpTransactions(transactions, '')).toBe(transactions);
  });

  it('matches people by name and paid or unpaid bill details, ignoring case', () => {
    expect(filterSettleUpPeople(people, ' MAYA ')).toEqual([people[0]]);
    expect(filterSettleUpPeople(people, 'cinema')).toEqual([people[1]]);
    expect(filterSettleUpPeople(people, 'entertainment')).toEqual([people[1]]);
  });

  it('matches bills by note, category, or a paid or unpaid person', () => {
    expect(filterSettleUpTransactions(transactions, 'BRUNCH')).toEqual([transactions[0]]);
    expect(filterSettleUpTransactions(transactions, 'entertainment')).toEqual([transactions[1]]);
    expect(filterSettleUpTransactions(transactions, 'ezra')).toEqual([transactions[1]]);
  });

  it('returns no entries for an unmatched query', () => {
    expect(filterSettleUpPeople(people, 'taxi')).toEqual([]);
    expect(filterSettleUpTransactions(transactions, 'taxi')).toEqual([]);
  });
});
