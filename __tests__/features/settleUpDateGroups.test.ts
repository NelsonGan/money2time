import {
  groupSettleUpItemsByDate,
  groupSettleUpPeopleByDate,
  groupSettleUpSearchResultsByDate,
  groupSettleUpTransactionsByDate,
} from '~/features/transactions/lib/settleUpDateGroups';
import type { PersonDebt, TransactionDebt } from '~/types';

function person(
  key: string,
  bills: { date: string; paidAt: string | null }[],
  unpaidBillCount: number,
): PersonDebt {
  return {
    key,
    name: key,
    totalReporting: unpaidBillCount * 10,
    paidReporting: 0,
    byCurrency: [],
    bills: bills.map((bill, index) => ({
      splitId: `${key}-${index}`,
      transactionId: `${key}-tx-${index}`,
      date: bill.date,
      amount: 10,
      currency: 'USD',
      reportingAmount: 10,
      note: null,
      categoryName: null,
      categoryIcon: null,
      paybackAccountId: null,
      paidAt: bill.paidAt,
    })),
    oldestDate: bills[bills.length - 1]?.date ?? '',
    billCount: bills.length,
    unpaidBillCount,
  };
}

function transaction(
  transactionId: string,
  date: string,
  latestPaidAt: string | null,
  unpaidSplitCount: number,
): TransactionDebt {
  return {
    transactionId,
    date,
    note: null,
    categoryName: null,
    categoryIcon: null,
    currency: 'USD',
    totalReporting: unpaidSplitCount * 10,
    totalNative: unpaidSplitCount * 10,
    paidNative: latestPaidAt ? 10 : 0,
    latestPaidAt,
    splits: [],
    splitCount: unpaidSplitCount,
    unpaidSplitCount,
  };
}

describe('Who owes you date groups', () => {
  it('groups detail shares by their own payment or bill day', () => {
    const shares = [
      { id: 'open-a', date: '2026-06-01', paidAt: null },
      { id: 'paid-a', date: '2026-05-01', paidAt: '2026-06-10' },
      { id: 'open-b', date: '2026-06-01', paidAt: null },
      { id: 'paid-b', date: '2026-04-01', paidAt: '2026-06-10' },
    ];
    const groups = groupSettleUpItemsByDate(shares, (share) => share.paidAt ?? share.date);
    expect(groups.map((group) => group.dayKey)).toEqual(['2026-06-10', '2026-06-01']);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['paid-a', 'paid-b'],
      ['open-a', 'open-b'],
    ]);
  });

  it('groups people by their latest unpaid bill or latest payback, newest day first', () => {
    const groups = groupSettleUpPeopleByDate([
      person('alice', [{ date: '2026-06-01', paidAt: null }], 1),
      person('carol', [{ date: '2026-06-10', paidAt: null }], 1),
      person('bob', [{ date: '2026-01-01', paidAt: '2026-06-10' }], 0),
    ]);

    expect(groups.map((group) => group.dayKey)).toEqual(['2026-06-10', '2026-06-01']);
    expect(groups.map((group) => group.items.map((item) => item.key))).toEqual([
      ['carol', 'bob'],
      ['alice'],
    ]);
  });

  it('uses the newest unpaid bill for a person with older paid history', () => {
    const groups = groupSettleUpPeopleByDate([
      person(
        'alice',
        [
          { date: '2026-05-01', paidAt: '2026-06-10' },
          { date: '2026-04-01', paidAt: null },
          { date: '2026-06-05', paidAt: null },
        ],
        2,
      ),
    ]);
    expect(groups[0].dayKey).toBe('2026-06-05');
  });

  it('groups open bills by bill date and fully paid bills by latest payback date', () => {
    const groups = groupSettleUpTransactionsByDate([
      transaction('open', '2026-06-01', '2026-06-12', 1),
      transaction('paid', '2026-01-01', '2026-06-10', 0),
    ]);

    expect(groups.map((group) => group.dayKey)).toEqual(['2026-06-10', '2026-06-01']);
    expect(groups.map((group) => group.items.map((item) => item.transactionId))).toEqual([
      ['paid'],
      ['open'],
    ]);
  });

  it('uses the local calendar day for a payment timestamp', () => {
    const paidAt = new Date(2026, 5, 10, 23, 30).toISOString();
    const groups = groupSettleUpPeopleByDate([person('paid', [{ date: '2026-01-01', paidAt }], 0)]);
    expect(groups[0].dayKey).toBe('2026-06-10');
  });

  it('combines matching people and transactions under the same dates, newest first', () => {
    const groups = groupSettleUpSearchResultsByDate(
      [
        person('maya', [{ date: '2026-06-01', paidAt: null }], 1),
        person('ezra', [{ date: '2026-01-01', paidAt: '2026-06-10' }], 0),
      ],
      [
        transaction('brunch', '2026-06-10', null, 1),
        transaction('cinema', '2026-01-01', '2026-06-01', 0),
      ],
    );

    expect(groups.map((group) => group.dayKey)).toEqual(['2026-06-10', '2026-06-01']);
    expect(groups.map((group) => group.items.map((item) => item.kind))).toEqual([
      ['person', 'transaction'],
      ['person', 'transaction'],
    ]);
    expect(groups[0].items).toEqual([
      { kind: 'person', person: expect.objectContaining({ key: 'ezra' }) },
      { kind: 'transaction', transaction: expect.objectContaining({ transactionId: 'brunch' }) },
    ]);
  });
});
