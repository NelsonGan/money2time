import {
  groupSettleUpItemsByDate,
  groupSettleUpPeopleByDate,
  groupSettleUpSearchResultsByDate,
  groupSettleUpShareCards,
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
    memberId: null,
    totalReporting: unpaidBillCount * 10,
    paidReporting: 0,
    owedReporting: 0,
    owedPaidReporting: 0,
    netReporting: 0,
    byCurrency: [],
    owedByCurrency: [],
    netByCurrency: [],
    bills: bills.map((bill, index) => ({
      splitId: `${key}-${index}`,
      direction: 'owes_you' as const,
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
      shareTotal: 10,
      sharePaid: 0,
      shareKey: 'share',
    })),
    oldestDate: bills[bills.length - 1]?.date ?? '',
    billCount: bills.length,
    unpaidBillCount,
    youOweCount: 0,
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
    paidBy: null,
    billTotalNative: null,
    participants: [],
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

describe('groupSettleUpShareCards', () => {
  const row = (id: string, shareKey: string, date: string, paidAt: string | null) => ({
    id,
    shareKey,
    date,
    paidAt,
  });

  it('puts each share on one card with its payments, still owed first', () => {
    const groups = groupSettleUpShareCards(
      [
        row('ben', 'ben', '2026-10-12', null),
        row('chloe', 'chloe', '2026-10-20', null),
        row('ben-1', 'ben', '2026-10-12', '2026-11-01T10:00:00'),
        row('ben-2', 'ben', '2026-10-12', '2026-11-07T10:00:00'),
        row('aisha', 'aisha', '2026-10-12', '2026-11-05T10:00:00'),
        row('aisha-1', 'aisha', '2026-10-12', '2026-11-02T10:00:00'),
        row('daniel', 'daniel', '2026-10-12', '2026-11-07T09:00:00'),
      ],
      (item) => item.date,
    );
    expect(
      groups.map((group) => [
        group.dayKey,
        group.items.map((card) => [card.share.id, card.payments.map((p) => p.id)]),
      ]),
    ).toEqual([
      ['2026-10-20', [['chloe', []]]],
      ['2026-10-12', [['ben', ['ben-2', 'ben-1']]]],
      ['2026-11-07', [['daniel', ['daniel']]]],
      ['2026-11-05', [['aisha', ['aisha', 'aisha-1']]]],
    ]);
  });

  it('keeps a second unpaid row of a share on its own card', () => {
    const groups = groupSettleUpShareCards(
      [row('a', 'a', '2026-10-12', null), row('b', 'a', '2026-10-12', null)],
      (item) => item.date,
    );
    expect(groups[0]!.items.map((card) => card.share.id)).toEqual(['a', 'b']);
  });
});
