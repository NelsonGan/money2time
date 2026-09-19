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
    dayOrder: null,
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

  it('orders different times on the same day by transaction time, even after an edit', () => {
    const morning = makeTx({
      id: 'morning',
      date: '2026-05-13T08:00:00.000Z',
      updatedAt: '2026-05-14T10:00:00.000Z',
    });
    const evening = makeTx({
      id: 'evening',
      date: '2026-05-13T18:00:00.000Z',
      updatedAt: '2026-05-13T18:00:00.000Z',
    });
    expect(sortTransactions([morning, evening], 'date_desc').map((tx) => tx.id)).toEqual([
      'evening',
      'morning',
    ]);
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

  describe('order within a day', () => {
    const midnight = '2026-05-13T00:00:00.000Z';

    it('orders rows nobody dragged by when they were created', () => {
      const older = makeTx({ id: 'older', date: midnight, createdAt: '2026-05-13T08:00:00.000Z' });
      const newer = makeTx({ id: 'newer', date: midnight, createdAt: '2026-05-13T09:00:00.000Z' });
      expect(sortTransactions([older, newer], 'date_desc').map((t) => t.id)).toEqual([
        'newer',
        'older',
      ]);
    });

    it('does not move a row when it is edited', () => {
      const older = makeTx({ id: 'older', date: midnight, createdAt: '2026-05-13T08:00:00.000Z' });
      const newer = makeTx({ id: 'newer', date: midnight, createdAt: '2026-05-13T09:00:00.000Z' });
      // Editing the older row (or renaming its category) only moves updatedAt.
      const edited = { ...older, updatedAt: '2026-05-13T12:00:00.000Z' };
      expect(sortTransactions([edited, newer], 'date_desc').map((t) => t.id)).toEqual([
        'newer',
        'older',
      ]);
    });

    it('places a dragged row by its key against the others’ creation times', () => {
      const top = makeTx({ id: 'top', date: midnight, createdAt: '2026-05-13T09:00:00.000Z' });
      const bottom = makeTx({
        id: 'bottom',
        date: midnight,
        createdAt: '2026-05-13T07:00:00.000Z',
      });
      const dragged = makeTx({
        id: 'dragged',
        date: midnight,
        // Created last, yet ordered by its key, between the other two.
        createdAt: '2026-05-13T10:00:00.000Z',
        dayOrder: Date.parse('2026-05-13T08:00:00.000Z'),
      });
      expect(sortTransactions([top, dragged, bottom], 'date_desc').map((t) => t.id)).toEqual([
        'top',
        'dragged',
        'bottom',
      ]);
      expect(sortTransactions([top, dragged, bottom], 'date_asc').map((t) => t.id)).toEqual([
        'bottom',
        'dragged',
        'top',
      ]);
    });

    it('puts a record added after a drag above the dragged row', () => {
      const dragged = makeTx({
        id: 'dragged',
        date: midnight,
        dayOrder: Date.parse('2026-05-13T10:00:00.000Z'),
      });
      const added = makeTx({ id: 'added', date: midnight, createdAt: '2026-05-13T10:05:00.000Z' });
      expect(sortTransactions([dragged, added], 'date_desc').map((t) => t.id)).toEqual([
        'added',
        'dragged',
      ]);
    });

    it('still orders by time of day before the key', () => {
      const timed = makeTx({ id: 'timed', date: '2026-05-13T05:00:00.000Z' });
      const dragged = makeTx({ id: 'dragged', date: midnight, dayOrder: Number.MAX_SAFE_INTEGER });
      expect(sortTransactions([dragged, timed], 'date_desc').map((t) => t.id)).toEqual([
        'timed',
        'dragged',
      ]);
    });

    it('orders a date-only row by time, as local midnight, in every timezone', () => {
      const localMidnight = new Date(2026, 4, 13).toISOString();
      const editorRow = makeTx({
        id: 'editor',
        date: localMidnight,
        createdAt: '2026-05-13T08:00:00.000Z',
      });
      const quickRow = makeTx({
        id: 'quick',
        date: '2026-05-13',
        createdAt: '2026-05-13T09:00:00.000Z',
      });
      // Same instant, so the later-created row wins both ways round.
      expect(sortTransactions([editorRow, quickRow], 'date_desc').map((t) => t.id)).toEqual([
        'quick',
        'editor',
      ]);
      const laterEditorRow = { ...editorRow, createdAt: '2026-05-13T10:00:00.000Z' };
      expect(sortTransactions([laterEditorRow, quickRow], 'date_desc').map((t) => t.id)).toEqual([
        'editor',
        'quick',
      ]);
    });
  });
});
