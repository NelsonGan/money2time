import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import type { TransactionWithRelations } from '~/types';
import {
  compareTransactionsByDateAsc,
  compareTransactionsByDateDesc,
  sortTransactions,
} from '~/utils/transactionSorting';

function makeTx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 'tx',
    type: 'expense',
    amount: overrides.amount ?? 0,
    currency: 'USD',
    reportingCurrency: 'USD',
    reportingAmount: overrides.amount ?? 0,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    receiptUri: null,
    date: overrides.date ?? '2026-05-13T00:00:00.000Z',
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    categoryId: null,
    note: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    countsAsExpense: false,
    ...NO_REIMBURSEMENT,
    createdAt: overrides.createdAt ?? '2026-05-13T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('compareTransactionsByDateDesc', () => {
  it('orders later dates first', () => {
    const a = makeTx({ id: 'a', date: '2026-05-13T00:00:00.000Z' });
    const b = makeTx({ id: 'b', date: '2026-05-14T00:00:00.000Z' });
    expect(compareTransactionsByDateDesc(a, b)).toBeGreaterThan(0);
    expect(compareTransactionsByDateDesc(b, a)).toBeLessThan(0);
  });

  it('breaks ties by updatedAt, then createdAt, then id', () => {
    const a = makeTx({
      id: 'a',
      date: '2026-05-13T00:00:00.000Z',
      createdAt: '2026-05-13T00:00:00.000Z',
      updatedAt: '2026-05-13T00:00:00.000Z',
    });
    const b = makeTx({
      id: 'b',
      date: '2026-05-13T00:00:00.000Z',
      createdAt: '2026-05-13T00:00:00.000Z',
      updatedAt: '2026-05-13T01:00:00.000Z',
    });
    expect(compareTransactionsByDateDesc(a, b)).toBeGreaterThan(0);
  });
});

describe('compareTransactionsByDateAsc', () => {
  it('orders earlier dates first', () => {
    const a = makeTx({ id: 'a', date: '2026-05-13T00:00:00.000Z' });
    const b = makeTx({ id: 'b', date: '2026-05-14T00:00:00.000Z' });
    expect(compareTransactionsByDateAsc(a, b)).toBeLessThan(0);
  });
});

describe('sortTransactions', () => {
  const t1 = makeTx({ id: 't1', amount: 10, date: '2026-05-10T00:00:00.000Z' });
  const t2 = makeTx({ id: 't2', amount: 50, date: '2026-05-12T00:00:00.000Z' });
  const t3 = makeTx({ id: 't3', amount: 25, date: '2026-05-15T00:00:00.000Z' });

  it('returns the original array when fewer than 2 entries', () => {
    expect(sortTransactions([], 'date_desc')).toEqual([]);
    const single = [t1];
    expect(sortTransactions(single, 'date_desc')).toBe(single);
  });

  it('sorts by date descending', () => {
    const result = sortTransactions([t1, t2, t3], 'date_desc');
    expect(result.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
  });

  it('sorts by date ascending', () => {
    const result = sortTransactions([t3, t1, t2], 'date_asc');
    expect(result.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('sorts by amount descending', () => {
    const result = sortTransactions([t1, t2, t3], 'amount_desc');
    expect(result.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
  });

  it('sorts by amount ascending', () => {
    const result = sortTransactions([t3, t2, t1], 'amount_asc');
    expect(result.map((t) => t.id)).toEqual(['t1', 't3', 't2']);
  });

  it('returns the input untouched when already sorted', () => {
    const presorted = [t3, t2, t1];
    expect(sortTransactions(presorted, 'date_desc')).toBe(presorted);
  });
});
