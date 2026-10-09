import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import {
  applyReviewFilters,
  EMPTY_REVIEW_FILTERS,
  pruneReviewFilters,
  reviewFilterCount,
  type ReviewFilters,
} from '~/features/review/lib/reviewFilters';
import type { Category, TransactionWithRelations } from '~/types';

function makeTransaction(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: 't1',
    type: 'expense',
    amount: 10,
    currency: 'USD',
    reportingCurrency: null,
    reportingAmount: null,
    fxRate: null,
    toAmount: null,
    accountAmount: null,
    date: '2026-07-10',
    accountId: 'a1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: null,
    note: null,
    receiptUri: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    ...NO_REIMBURSEMENT,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  } as TransactionWithRelations;
}

function makeCategory(id: string, parentId: string | null = null): Category {
  return {
    id,
    name: id,
    sortOrder: 0,
    type: 'expense',
    parentId,
    icon: 'meal',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  } as Category;
}

const CATEGORIES = [
  makeCategory('food'),
  makeCategory('groceries', 'food'),
  makeCategory('rent'),
  makeCategory('salary'),
];

function filters(overrides: Partial<ReviewFilters> = {}): ReviewFilters {
  return { ...EMPTY_REVIEW_FILTERS, ...overrides };
}

describe('reviewFilterCount', () => {
  it('is zero for the default and sums all three lists', () => {
    expect(reviewFilterCount(EMPTY_REVIEW_FILTERS)).toBe(0);
    expect(
      reviewFilterCount(
        filters({
          excludedAccountIds: ['a1', 'a2'],
          excludedExpenseCategoryIds: ['food'],
          excludedIncomeCategoryIds: ['salary'],
        }),
      ),
    ).toBe(4);
  });
});

describe('applyReviewFilters', () => {
  const rows = [
    makeTransaction({ id: 'expense-food', categoryId: 'food' }),
    makeTransaction({ id: 'expense-groceries', categoryId: 'groceries' }),
    makeTransaction({ id: 'expense-rent', categoryId: 'rent' }),
    makeTransaction({ id: 'expense-uncategorized', categoryId: null }),
    makeTransaction({ id: 'income-salary', type: 'income', categoryId: 'salary' }),
    makeTransaction({ id: 'other-account', accountId: 'a2', categoryId: 'rent' }),
  ];

  const idsAfter = (input: ReviewFilters) =>
    applyReviewFilters(rows, input, CATEGORIES).map((transaction) => transaction.id);

  it('returns the same array reference when nothing is excluded', () => {
    expect(applyReviewFilters(rows, EMPTY_REVIEW_FILTERS, CATEGORIES)).toBe(rows);
  });

  it('drops every row on an excluded account, whatever its type', () => {
    expect(idsAfter(filters({ excludedAccountIds: ['a1'] }))).toEqual(['other-account']);
  });

  it('excluding a parent category takes its children with it', () => {
    expect(idsAfter(filters({ excludedExpenseCategoryIds: ['food'] }))).toEqual([
      'expense-rent',
      'expense-uncategorized',
      'income-salary',
      'other-account',
    ]);
  });

  it('excluding a child leaves the parent and its siblings alone', () => {
    expect(idsAfter(filters({ excludedExpenseCategoryIds: ['groceries'] }))).toEqual([
      'expense-food',
      'expense-rent',
      'expense-uncategorized',
      'income-salary',
      'other-account',
    ]);
  });

  it('keeps uncategorized rows, which no category filter names', () => {
    expect(idsAfter(filters({ excludedExpenseCategoryIds: ['food', 'rent'] }))).toContain(
      'expense-uncategorized',
    );
  });

  it('applies expense and income exclusions to their own type only', () => {
    // An id shared between an expense and an income category must not leak
    // across: excluding it as income leaves the expense rows standing.
    expect(idsAfter(filters({ excludedIncomeCategoryIds: ['rent', 'salary'] }))).toEqual([
      'expense-food',
      'expense-groceries',
      'expense-rent',
      'expense-uncategorized',
      'other-account',
    ]);
  });

  it('combines account and category exclusions', () => {
    expect(
      idsAfter(filters({ excludedAccountIds: ['a2'], excludedExpenseCategoryIds: ['food'] })),
    ).toEqual(['expense-rent', 'expense-uncategorized', 'income-salary']);
  });
});

describe('pruneReviewFilters', () => {
  const accountIds = new Set(['a1']);
  const expenseCategoryIds = new Set(['food']);
  const incomeCategoryIds = new Set(['salary']);

  it('returns the same object when every id still exists', () => {
    const input = filters({ excludedAccountIds: ['a1'], excludedExpenseCategoryIds: ['food'] });
    expect(pruneReviewFilters(input, accountIds, expenseCategoryIds, incomeCategoryIds)).toBe(
      input,
    );
  });

  it('drops ids whose account or category is gone', () => {
    const input = filters({
      excludedAccountIds: ['a1', 'deleted'],
      excludedExpenseCategoryIds: ['gone'],
      excludedIncomeCategoryIds: ['salary'],
    });
    expect(pruneReviewFilters(input, accountIds, expenseCategoryIds, incomeCategoryIds)).toEqual({
      ...EMPTY_REVIEW_FILTERS,
      excludedAccountIds: ['a1'],
      excludedExpenseCategoryIds: [],
      excludedIncomeCategoryIds: ['salary'],
    });
  });
});

describe('applyReviewFilters in include mode', () => {
  const rows = [
    makeTransaction({ id: 'expense-food', categoryId: 'food' }),
    makeTransaction({ id: 'expense-groceries', categoryId: 'groceries' }),
    makeTransaction({ id: 'expense-rent', categoryId: 'rent' }),
    makeTransaction({ id: 'expense-uncategorized', categoryId: null }),
    makeTransaction({ id: 'income-salary', type: 'income', categoryId: 'salary' }),
    makeTransaction({ id: 'other-account', accountId: 'a2', categoryId: 'rent' }),
    makeTransaction({
      id: 'transfer-into-a2',
      type: 'transfer',
      accountId: null,
      fromAccountId: 'a1',
      toAccountId: 'a2',
    }),
  ];

  const idsAfter = (input: ReviewFilters) =>
    applyReviewFilters(rows, input, CATEGORIES).map((transaction) => transaction.id);

  it('keeps only rows on the picked accounts, including transfers that touch them', () => {
    expect(idsAfter(filters({ accountMode: 'include', excludedAccountIds: ['a2'] }))).toEqual([
      'other-account',
      'transfer-into-a2',
    ]);
  });

  it('including a parent category keeps its children and leaves income alone', () => {
    expect(
      idsAfter(filters({ expenseCategoryMode: 'include', excludedExpenseCategoryIds: ['food'] })),
    ).toEqual(['expense-food', 'expense-groceries', 'income-salary', 'transfer-into-a2']);
  });

  it('is off while nothing is picked, so flipping the mode alone changes nothing', () => {
    expect(
      applyReviewFilters(
        rows,
        filters({ accountMode: 'include', expenseCategoryMode: 'include' }),
        CATEGORIES,
      ),
    ).toBe(rows);
  });

  it('mixes modes per filter', () => {
    expect(
      idsAfter(
        filters({
          accountMode: 'include',
          excludedAccountIds: ['a1'],
          expenseCategoryMode: 'exclude',
          excludedExpenseCategoryIds: ['food'],
        }),
      ),
    ).toEqual(['expense-rent', 'expense-uncategorized', 'income-salary', 'transfer-into-a2']);
  });

  it('keeps the modes when pruning stale ids', () => {
    const input = filters({ accountMode: 'include', excludedAccountIds: ['a1', 'deleted'] });
    expect(pruneReviewFilters(input, new Set(['a1']), new Set(), new Set())).toEqual({
      ...input,
      excludedAccountIds: ['a1'],
    });
  });
});
