import type { TransactionWithRelations } from '~/types';
import {
  bucketTransactionsByMonth,
  emptyMonthSummary,
  filterTransactionsByWallet,
  summarizeTransactions,
} from '~/utils/transactions';

function makeTx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 'tx',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 0,
    currency: 'USD',
    reportingCurrency: overrides.reportingCurrency ?? 'USD',
    reportingAmount: overrides.reportingAmount ?? overrides.amount ?? 0,
    fxRate: overrides.fxRate ?? 1,
    toAmount: overrides.toAmount ?? null,
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
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('filterTransactionsByWallet', () => {
  const a = makeTx({ id: 'a', accountId: 'w1' });
  const b = makeTx({ id: 'b', accountId: 'w2' });
  const transfer = makeTx({ id: 'c', type: 'transfer', fromAccountId: 'w1', toAccountId: 'w2' });
  const unrelated = makeTx({ id: 'd', accountId: 'w3' });
  const list: TransactionWithRelations[] = [a, b, transfer, unrelated];

  it('returns all transactions when walletId is null/undefined/empty', () => {
    expect(filterTransactionsByWallet(list, null)).toBe(list);
    expect(filterTransactionsByWallet(list, undefined)).toBe(list);
    expect(filterTransactionsByWallet(list, '')).toBe(list);
  });

  it('matches accountId, fromAccountId, and toAccountId', () => {
    expect(filterTransactionsByWallet(list, 'w1')).toEqual([a, transfer]);
    expect(filterTransactionsByWallet(list, 'w2')).toEqual([b, transfer]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterTransactionsByWallet(list, 'missing')).toEqual([]);
  });
});

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
});
