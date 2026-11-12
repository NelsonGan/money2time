import { summarizeSplits } from '~/lib/repositories/transactionsRepository';
import type { TransactionSplit } from '~/types';

function makeSplit(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: overrides.id ?? 's1',
    transactionId: 't1',
    personName: 'Alice',
    amount: 10,
    isSelf: false,
    paybackAccountId: null,
    paidAt: null,
    paidTransactionId: null,
    partOfSplitId: null,
    isPayer: false,
    shareAmount: null,
    memberId: null,
    albumMemberId: null,
    settlementId: null,
    sortOrder: 0,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('summarizeSplits', () => {
  it('counts a row that owes nothing as settled, as Settle Up does', () => {
    // Split evenly after a friend paid back more than an even part leaves
    // them an unpaid 0 row: the list must not show them as still owing.
    const splits = [
      makeSplit({ id: 'owed0', amount: 0 }),
      makeSplit({
        id: 'part',
        amount: 40,
        paidAt: '2026-05-14T00:00:00.000Z',
        partOfSplitId: 'owed0',
      }),
    ];
    expect(summarizeSplits(splits)).toEqual({
      count: 2,
      paidCount: 2,
      unpaidAmount: 0,
      totalOwed: 40,
      youOwe: false,
    });
  });

  it('returns zeros when there are no splits', () => {
    expect(summarizeSplits([])).toEqual({
      count: 0,
      paidCount: 0,
      unpaidAmount: 0,
      totalOwed: 0,
      youOwe: false,
    });
  });

  it('skips splits belonging to the owner (isSelf)', () => {
    const splits = [
      makeSplit({ id: 'self', isSelf: true, amount: 50 }),
      makeSplit({ id: 'a', amount: 10 }),
    ];
    const summary = summarizeSplits(splits);
    expect(summary.count).toBe(1);
    expect(summary.totalOwed).toBe(10);
  });

  it('counts paid vs unpaid splits and accumulates totals', () => {
    const splits = [
      makeSplit({ id: 'unpaid1', amount: 10 }),
      makeSplit({ id: 'unpaid2', amount: 15 }),
      makeSplit({ id: 'paid', amount: 20, paidAt: '2026-05-14T00:00:00.000Z' }),
    ];
    expect(summarizeSplits(splits)).toEqual({
      count: 3,
      paidCount: 1,
      unpaidAmount: 25,
      totalOwed: 45,
      youOwe: false,
    });
  });

  it('treats a paid split as fully owed but not unpaid', () => {
    const splits = [makeSplit({ amount: 30, paidAt: '2026-05-14T00:00:00.000Z' })];
    expect(summarizeSplits(splits)).toEqual({
      count: 1,
      paidCount: 1,
      unpaidAmount: 0,
      totalOwed: 30,
      youOwe: false,
    });
  });

  describe('a bill a friend paid', () => {
    const rows = (paidAt: string | null = null) => [
      makeSplit({ id: 'me', isSelf: true, amount: 30 }),
      makeSplit({ id: 'aisha', amount: 0, isPayer: true, shareAmount: 30, paidAt }),
      makeSplit({ id: 'ben', amount: 0, shareAmount: 30 }),
    ];

    it('has one share to settle: what the user owes the payer', () => {
      expect(summarizeSplits(rows())).toEqual({
        count: 1,
        paidCount: 0,
        unpaidAmount: 30,
        totalOwed: 30,
        youOwe: true,
      });
    });

    it('is settled once the user has paid the payer back', () => {
      expect(summarizeSplits(rows('2026-11-12T00:00:00.000Z'))).toEqual({
        count: 1,
        paidCount: 1,
        unpaidAmount: 0,
        totalOwed: 30,
        youOwe: true,
      });
    });

    it('counts what is left once part of it is paid back', () => {
      const partPaid = [
        makeSplit({ id: 'me', isSelf: true, amount: 20 }),
        makeSplit({ id: 'aisha', amount: 0, isPayer: true, shareAmount: 30 }),
        makeSplit({
          id: 'part',
          amount: 0,
          shareAmount: 10,
          partOfSplitId: 'aisha',
          paidAt: '2026-11-08T00:00:00.000Z',
        }),
      ];
      expect(summarizeSplits(partPaid)).toEqual({
        count: 1,
        paidCount: 0,
        unpaidAmount: 20,
        totalOwed: 30,
        youOwe: true,
      });
    });

    it('is settled when the user had no share of it', () => {
      const none = rows().map((split) => (split.isSelf ? { ...split, amount: 0 } : split));
      expect(summarizeSplits(none)).toMatchObject({ count: 1, paidCount: 1, unpaidAmount: 0 });
    });
  });
});
