import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import type { TransactionWithRelations } from '~/types';
import {
  bucketTransactionsByMonth,
  emptyMonthSummary,
  reconcileTransactionRow,
  reuseUnchangedGroups,
  reuseUnchangedTransactions,
  summarizeTransactions,
} from '~/utils/transactions';

function makeTx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 'tx',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 0,
    currency: 'USD',
    dayOrder: null,
    reportingCurrency: overrides.reportingCurrency ?? 'USD',
    reportingAmount: overrides.reportingAmount ?? overrides.amount ?? 0,
    fxRate: overrides.fxRate ?? 1,
    toAmount: overrides.toAmount ?? null,
    accountAmount: overrides.accountAmount ?? null,
    receiptUri: overrides.receiptUri ?? null,
    date: overrides.date ?? '2026-05-13T00:00:00.000Z',
    accountId: overrides.accountId ?? null,
    fromAccountId: overrides.fromAccountId ?? null,
    toAccountId: overrides.toAccountId ?? null,
    categoryId: overrides.categoryId ?? null,
    note: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    countsAsExpense: false,
    ...NO_REIMBURSEMENT,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('summarizeTransactions', () => {
  it('returns an empty summary for an empty list', () => {
    expect(summarizeTransactions([], (t) => t.amount)).toEqual(emptyMonthSummary());
  });

  it('aggregates income and expense amounts, counting every entry', () => {
    const txs = [
      makeTx({ type: 'income', amount: 100 }),
      makeTx({ type: 'expense', amount: 40 }),
      makeTx({ type: 'expense', amount: 60 }),
      makeTx({ type: 'transfer', amount: 25, fromAccountId: 'a', toAccountId: 'b' }),
    ];
    expect(summarizeTransactions(txs, (t) => t.amount)).toEqual({
      count: 4,
      income: 100,
      expense: 100,
    });
  });

  it('uses the provided resolveValue function', () => {
    const txs = [makeTx({ type: 'income', amount: 10 }), makeTx({ type: 'expense', amount: 10 })];
    expect(summarizeTransactions(txs, () => 2)).toEqual({ count: 2, income: 2, expense: 2 });
  });
});

describe('bucketTransactionsByMonth', () => {
  it('buckets transactions by month key with per-month summaries', () => {
    const txs = [
      makeTx({ id: 'a', type: 'income', amount: 100, date: '2026-05-01T00:00:00.000Z' }),
      makeTx({ id: 'b', type: 'expense', amount: 30, date: '2026-05-15T00:00:00.000Z' }),
      makeTx({ id: 'c', type: 'income', amount: 50, date: '2026-06-02T00:00:00.000Z' }),
    ];
    const { transactionsMap, summaries } = bucketTransactionsByMonth(txs, (t) => t.amount);
    expect(Array.from(transactionsMap.keys()).sort()).toEqual(['2026-05', '2026-06']);
    expect(transactionsMap.get('2026-05')?.length).toBe(2);
    expect(transactionsMap.get('2026-06')?.length).toBe(1);
    expect(summaries.get('2026-05')).toEqual({ count: 2, income: 100, expense: 30 });
    expect(summaries.get('2026-06')).toEqual({ count: 1, income: 50, expense: 0 });
  });

  it('returns empty maps when given no transactions', () => {
    const { transactionsMap, summaries } = bucketTransactionsByMonth([], (t) => t.amount);
    expect(transactionsMap.size).toBe(0);
    expect(summaries.size).toBe(0);
  });

  it('buckets by the financial month when a custom first day is given', () => {
    const txs = [
      makeTx({ id: 'a', type: 'expense', amount: 30, date: '2026-05-24' }),
      makeTx({ id: 'b', type: 'expense', amount: 40, date: '2026-05-25' }),
    ];
    const { transactionsMap } = bucketTransactionsByMonth(txs, (t) => t.amount, 25);
    // May 24 is before the 25th cycle start → April; May 25 → May.
    expect(Array.from(transactionsMap.keys()).sort()).toEqual(['2026-04', '2026-05']);
    expect(transactionsMap.get('2026-04')?.[0]?.id).toBe('a');
    expect(transactionsMap.get('2026-05')?.[0]?.id).toBe('b');
  });
});

describe('reuseUnchangedGroups', () => {
  it('hands back the old array for a group holding the same rows', () => {
    const a = makeTx({ id: 'a' });
    const b = makeTx({ id: 'b' });
    const c = makeTx({ id: 'c' });
    const previous = new Map([
      ['2026-05', [a, b]],
      ['2026-04', [c]],
    ]);
    const next = new Map([
      ['2026-05', [a, b]],
      ['2026-04', [c, makeTx({ id: 'd' })]],
    ]);
    const result = reuseUnchangedGroups(previous, next);
    expect(result.get('2026-05')).toBe(previous.get('2026-05'));
    expect(result.get('2026-04')).not.toBe(previous.get('2026-04'));
    expect(result.get('2026-04')?.map((tx) => tx.id)).toEqual(['c', 'd']);
  });

  it('keeps the new array when a row object changed or the order did', () => {
    const a = makeTx({ id: 'a' });
    const b = makeTx({ id: 'b' });
    const previous = new Map([['2026-05', [a, b]]]);
    expect(reuseUnchangedGroups(previous, new Map([['2026-05', [b, a]]])).get('2026-05')).not.toBe(
      previous.get('2026-05'),
    );
    const edited = { ...a, amount: 5 };
    expect(
      reuseUnchangedGroups(previous, new Map([['2026-05', [edited, b]]])).get('2026-05'),
    ).not.toBe(previous.get('2026-05'));
  });

  it('returns the new map untouched without a previous one', () => {
    const next = new Map([['2026-05', [makeTx({ id: 'a' })]]]);
    expect(reuseUnchangedGroups(null, next)).toBe(next);
  });
});

describe('reuseUnchangedTransactions', () => {
  it('returns the previous list when a reload changed nothing', () => {
    const prev = [makeTx({ id: 'a', amount: 1 }), makeTx({ id: 'b', amount: 2 })];
    const reloaded = prev.map((tx) => ({ ...tx }));
    expect(reuseUnchangedTransactions(prev, reloaded)).toBe(prev);
  });

  it('keeps the old object for every unchanged row and takes the changed ones', () => {
    const prev = [makeTx({ id: 'a', amount: 1 }), makeTx({ id: 'b', amount: 2 })];
    const reloaded = [{ ...prev[0]!, amount: 10 }, { ...prev[1]! }];
    const result = reuseUnchangedTransactions(prev, reloaded);
    expect(result).not.toBe(prev);
    expect(result[0]).toBe(reloaded[0]);
    expect(result[1]).toBe(prev[1]);
  });

  it('treats a reorder, an addition and a removal as changes', () => {
    const a = makeTx({ id: 'a' });
    const b = makeTx({ id: 'b' });
    const reordered = reuseUnchangedTransactions([a, b], [{ ...b }, { ...a }]);
    expect(reordered.map((tx) => tx.id)).toEqual(['b', 'a']);
    expect(reordered[0]).toBe(b);
    expect(reuseUnchangedTransactions([a, b], [{ ...a }]).map((tx) => tx.id)).toEqual(['a']);
    const c = makeTx({ id: 'c' });
    expect(reuseUnchangedTransactions([a], [{ ...a }, c])).toEqual([a, c]);
  });

  it('compares split arrays by content, since a reload always builds new ones', () => {
    const split = {
      id: 's1',
      transactionId: 'a',
      personName: 'Sam',
      amount: 5,
      isSelf: false,
      paybackAccountId: null,
      paidAt: null,
      paidTransactionId: null,
      sortOrder: 0,
      createdAt: '2026-05-13T00:00:00.000Z',
      updatedAt: '2026-05-13T00:00:00.000Z',
      deletedAt: null,
    };
    const prev = [makeTx({ id: 'a', splits: [split] })];
    expect(reuseUnchangedTransactions(prev, [{ ...prev[0]!, splits: [{ ...split }] }])).toBe(prev);
    const paid = { ...split, paidAt: '2026-05-14T00:00:00.000Z' };
    expect(reuseUnchangedTransactions(prev, [{ ...prev[0]!, splits: [paid] }])).not.toBe(prev);
  });

  it('adopts the new list outright when there was nothing before', () => {
    const next = [makeTx({ id: 'a' })];
    expect(reuseUnchangedTransactions([], next)).toBe(next);
  });
});

describe('reconcileTransactionRow', () => {
  const optimistic = makeTx({ id: 'new', amount: 12 });
  const other = makeTx({ id: 'old', amount: 3 });

  it('keeps the list when the stored row matches the optimistic one', () => {
    const prev = [optimistic, other];
    expect(reconcileTransactionRow(prev, 'new', { ...optimistic })).toBe(prev);
  });

  it('swaps in the stored row when it differs', () => {
    const prev = [optimistic, other];
    const stored = { ...optimistic, categoryName: 'Food' };
    const result = reconcileTransactionRow(prev, 'new', stored);
    expect(result).not.toBe(prev);
    expect(result[0]).toBe(stored);
    expect(result[1]).toBe(other);
  });

  it('drops the optimistic row when the write did not land', () => {
    expect(reconcileTransactionRow([optimistic, other], 'new', null)).toEqual([other]);
  });

  it('ignores an id that is no longer in the list', () => {
    const prev = [other];
    expect(reconcileTransactionRow(prev, 'new', optimistic)).toBe(prev);
  });
});
