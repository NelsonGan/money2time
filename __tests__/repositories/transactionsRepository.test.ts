import { summarizeSplits } from '~/lib/repositories/transactionsRepository';
import type { TransactionSplit } from '~/types';

function makeSplit(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: overrides.id ?? 's1',
    transactionId: 't1',
    personName: 'Alice',
    amount: 10,
    isSelf: false,
    isShared: false,
    note: null,
    paybackAccountId: null,
    paidAt: null,
    paidTransactionId: null,
    sortOrder: 0,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('summarizeSplits', () => {
  it('returns zeros when there are no splits', () => {
    expect(summarizeSplits([])).toEqual({
      count: 0,
      paidCount: 0,
      unpaidAmount: 0,
      totalOwed: 0,
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
    });
  });

  it('treats a paid split as fully owed but not unpaid', () => {
    const splits = [makeSplit({ amount: 30, paidAt: '2026-05-14T00:00:00.000Z' })];
    expect(summarizeSplits(splits)).toEqual({
      count: 1,
      paidCount: 1,
      unpaidAmount: 0,
      totalOwed: 30,
    });
  });
});
