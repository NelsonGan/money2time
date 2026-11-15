import { describeActivity } from '~/features/albums/lib/activityLines';
import { albumCategoryRows, groupEntryCategories } from '~/features/albums/lib/albumBreakdown';
import {
  albumCategoryForCategory,
  albumCategoryForText,
  albumCategoryId,
  albumCategoryKeyOfId,
  personalCategoryFor,
} from '~/features/albums/lib/albumCategories';
import { albumIdOfLine, albumInitial, albumLineId } from '~/features/albums/lib/albumLines';
import { albumCategoryColumns, albumCategoryOf } from '~/features/albums/lib/groupPlan';
import { buildBudgetSummary } from '~/features/budget/lib/budgetMath';
import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import { buildReviewSummary } from '~/features/review/lib/reviewMath';
import { lastCompletedPeriod } from '~/features/review/lib/reviewPeriods';
import {
  buildHouseholdIndex,
  buildHouseholdMonth,
  OWNER_KEY,
} from '~/features/sharedLedgers/lib/householdMath';
import type {
  AlbumActivity,
  AlbumExpense,
  Category,
  PeriodBudget,
  TransactionWithRelations,
} from '~/types';

// Albums as their own line in the category lists, and a shared album's fixed
// categories (README: Key patterns > Albums; Album members and shared albums >
// Categories). Pure: no database, no React. In English, with the app's real
// strings.
jest.mock('~/lib/i18n', () => {
  const strings = jest.requireActual('~/lib/i18n/locales/en').default;
  return {
    I18n: {
      locale: 'en',
      t: (key: string, options: Record<string, unknown> = {}) => {
        const template = key
          .split('.')
          .reduce(
            (node: Record<string, unknown> | undefined, part) => node?.[part] as never,
            strings,
          );
        return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name]));
      },
    },
  };
});

function category(
  id: string,
  name: string,
  icon: string,
  parentId: string | null = null,
  type: Category['type'] = 'expense',
): Category {
  return {
    id,
    name,
    sortOrder: 0,
    type,
    parentId,
    icon,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

function tx(
  id: string,
  amount: number,
  categoryId: string | null,
  extra: Partial<TransactionWithRelations> = {},
): TransactionWithRelations {
  return {
    id,
    type: 'expense',
    amount,
    currency: 'MYR',
    date: '2026-07-28T12:00:00.000Z',
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    categoryId,
    note: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    ...NO_REIMBURSEMENT,
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    deletedAt: null,
    ...extra,
  } as TransactionWithRelations;
}

// The app's default categories, one renamed, plus one of the user's own.
const CATEGORIES = [
  category('food', 'Makan', 'meal'),
  category('lunch', 'Lunch', 'meal', 'food'),
  category('transport', 'Transport', 'car'),
  category('coffee', 'Coffee', 'coffee'),
  category('other', 'Other', 'invoice'),
  category('salary', 'Salary', 'cash', null, 'income'),
];
const BY_ID = new Map(CATEGORIES.map((item) => [item.id, item]));

describe('album lines', () => {
  it('have ids no category takes, and an initial for an album with no cover', () => {
    expect(albumLineId('a1')).toBe('album:a1');
    expect(albumIdOfLine('album:a1')).toBe('a1');
    expect(albumIdOfLine('food')).toBeNull();
    expect(albumInitial('  bali trip')).toBe('B');
    expect(albumInitial('')).toBe('•');
  });
});

describe('a shared album’s categories', () => {
  it('file a bill under the user’s matching category, else their Other', () => {
    // Renamed "Makan", still the meal icon: Food.
    expect(personalCategoryFor('food', CATEGORIES)).toBe('food');
    expect(personalCategoryFor('transport', CATEGORIES)).toBe('transport');
    // No Groceries, Housing… of the user's: Other.
    expect(personalCategoryFor('groceries', CATEGORIES)).toBe('other');
    expect(personalCategoryFor('other', CATEGORIES)).toBe('other');
    // Quick Entry's own pick for a bucket wins.
    expect(personalCategoryFor('food', CATEGORIES, { food: 'coffee' })).toBe('coffee');
  });

  it('read one of the user’s own categories back as the album category it stands for', () => {
    expect(albumCategoryForCategory('food', CATEGORIES)).toBe('food');
    // A subcategory reads as its parent.
    expect(albumCategoryForCategory('lunch', CATEGORIES)).toBe('food');
    expect(albumCategoryForCategory('coffee', CATEGORIES)).toBe('other');
    // Other is Other, never Groceries, which only falls back to it.
    expect(albumCategoryForCategory('other', CATEGORIES)).toBe('other');
    expect(albumCategoryForCategory(null, CATEGORIES)).toBe('other');
  });

  it('are picked from a title by Quick Entry’s keywords', () => {
    expect(albumCategoryForText('Lunch')).toBe('food');
    expect(albumCategoryForText('Grab to the airport')).toBe('transport');
    // A keyword of another kind (a movie): Other.
    expect(albumCategoryForText('Cinema')).toBe('other');
    // No keyword: keep what is picked.
    expect(albumCategoryForText('Zxqv')).toBeNull();
    expect(albumCategoryForText('  ')).toBeNull();
  });

  it('go by a picker id no category row has', () => {
    expect(albumCategoryKeyOfId(albumCategoryId('shopping'))).toBe('shopping');
    expect(albumCategoryKeyOfId('album-category:pets')).toBeNull();
    expect(albumCategoryKeyOfId('food')).toBeNull();
  });

  it('read a bill’s key, else its icon, then its English name, else Other', () => {
    expect(albumCategoryOf({ category_key: 'bills', category_icon: 'meal' })).toBe('bills');
    expect(albumCategoryOf({ category_name: 'Makan', category_icon: 'meal' })).toBe('food');
    expect(albumCategoryOf({ category_name: 'housing', category_icon: '🏠' })).toBe('housing');
    expect(albumCategoryOf({ category_name: 'Coffee', category_icon: 'coffee' })).toBe('other');
    expect(albumCategoryOf({ category_key: 'pets' })).toBe('other');
    expect(albumCategoryColumns('healthcare')).toEqual({
      category_key: 'healthcare',
      category_name: 'Healthcare',
      category_icon: 'medicine',
    });
  });

  it('log a change of category with the category’s name', () => {
    const snapshot = (key: 'food' | 'transport') => ({
      note: 'Dinner',
      category: key,
      amount: 30,
      currency: 'MYR',
      date: '2026-11-14',
      paidBy: 'tess',
      shares: [{ memberId: 'tess', amount: 30 }],
    });
    const entry = {
      id: 'a1',
      groupId: 'bali',
      kind: 'bill_edited',
      actorMemberId: 'tess',
      actorUserId: null,
      expenseId: 'b1',
      memberId: null,
      bill: { before: snapshot('food'), after: snapshot('transport') },
      rename: null,
      payment: null,
      simplify: null,
      started: false,
      sortOrder: 0,
      createdAt: '2026-11-14T10:00:00.000Z',
    } as unknown as AlbumActivity;
    const line = describeActivity(entry, {
      selfId: 'me',
      nameOf: () => 'Tess',
      money: (amount) => `RM${amount}`,
      day: (date) => date,
    });
    expect(line.text).toBe('Tess filed Dinner under Transport');
  });
});

describe('an album’s breakdown', () => {
  const entries = [
    tx('b1', 30, 'food'),
    tx('b2', 20, 'transport', {
      splits: [{ paidTransactionId: 'part1' }] as TransactionWithRelations['splits'],
    }),
    tx('part1', 5, 'other'),
    tx('own', 12, 'lunch'),
  ];

  it('groups an album of the user’s own by their root categories', () => {
    const rows = albumCategoryRows(entries, {
      valueOf: (item) => item.amount,
      categories: CATEGORIES,
      categoryById: BY_ID,
      groupCategories: null,
    });
    expect(rows.map((row) => [row.id, row.label, row.amount, row.count])).toEqual([
      ['food', 'Makan', 42, 2],
      ['transport', 'Transport', 20, 1],
      ['other', 'Other', 5, 1],
    ]);
    expect(rows[0].categoryRootId).toBe('food');
  });

  it('groups a shared album by its own categories: a bill’s, its paid parts’ too', () => {
    const bills = [
      { id: 'b1', category: 'groceries' },
      { id: 'b2', category: 'transport' },
    ] as AlbumExpense[];
    const groupCategories = groupEntryCategories(bills, entries);
    expect(groupCategories.get('part1')).toBe('transport');
    const rows = albumCategoryRows(entries, {
      valueOf: (item) => (item.id === 'b1' ? null : item.amount),
      categories: CATEGORIES,
      categoryById: BY_ID,
      groupCategories,
    });
    // b1 is left out (one person's breakdown with no share in it); the user's
    // own entry reads as the album category its category stands for.
    expect(rows.map((row) => [row.id, row.label, row.amount, row.categoryRootId])).toEqual([
      [albumCategoryId('transport'), 'Transport', 25, null],
      [albumCategoryId('food'), 'Food', 12, null],
    ]);
  });
});

describe('album spending in a budget', () => {
  const budget: PeriodBudget = {
    id: 'b1',
    period: 'month',
    periodKey: '2026-07',
    templateId: 'tpl1',
    templateName: 'Everyday',
    templateEmoji: null,
    totalAmount: 500,
    countUnbudgeted: false,
    currency: null,
    fxRate: null,
    lines: [{ id: 'l1', categoryId: 'food', amount: 100 } as PeriodBudget['lines'][number]],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
  };
  const transactions = [
    tx('a', 30, 'food'),
    tx('b', 50, 'food'),
    tx('c', 40, 'coffee'),
    tx('d', 25, 'transport'),
  ];
  const albumIdOf = (id: string) => (id === 'b' || id === 'c' ? 'bali' : null);

  it('counts toward the total, never a category’s line, even with unbudgeted spending off', () => {
    const summary = buildBudgetSummary({
      budget,
      transactions,
      categories: CATEGORIES,
      albumIdOf,
    })!;
    expect(summary.categories[0]).toMatchObject({ categoryId: 'food', spent: 30 });
    expect(summary.albums).toEqual([{ albumId: 'bali', spent: 90 }]);
    expect(summary.albumSpent).toBe(90);
    // Transport is unbudgeted, and not counted.
    expect(summary.unbudgetedSpent).toBe(25);
    expect(summary.totalSpent).toBe(120);
  });

  it('counts the same, nothing twice, with unbudgeted spending on', () => {
    const summary = buildBudgetSummary({
      budget: { ...budget, countUnbudgeted: true },
      transactions,
      categories: CATEGORIES,
      albumIdOf,
    })!;
    expect(summary.totalSpent).toBe(30 + 90 + 25);
    const spent = summary.categories.reduce((sum, line) => sum + line.spent, 0);
    expect(spent + summary.albumSpent + summary.unbudgetedSpent).toBe(summary.totalSpent);
  });

  it('is as before without albums', () => {
    const summary = buildBudgetSummary({ budget, transactions, categories: CATEGORIES })!;
    expect(summary.categories[0]).toMatchObject({ spent: 80 });
    expect(summary.albums).toEqual([]);
    expect(summary.totalSpent).toBe(80);
  });
});

describe('album lines in Review and Household', () => {
  it('Review lists an album as one line, its entries under it alone', () => {
    const period = lastCompletedPeriod({
      zoom: 'week',
      today: new Date(2026, 7, 3),
      weekStartsOn: 1,
      monthCycle: 1,
    });
    const album = { id: 'bali', name: 'Bali', coverPhotoUri: null };
    const summary = buildReviewSummary({
      period,
      transactions: [
        tx('a', 30, 'food'),
        tx('b', 50, 'food'),
        tx('c', 15, 'transport'),
        tx('i', 99, 'salary', { type: 'income' }),
      ],
      categories: CATEGORIES,
      hourlyRate: 0,
      albumOf: (id) => (id === 'b' || id === 'i' ? album : null),
    });
    expect(summary.categories.map((row) => [row.id, row.label, row.amount])).toEqual([
      [albumLineId('bali'), 'Bali', 50],
      ['food', 'Makan', 30],
      ['transport', 'Transport', 15],
    ]);
    expect(summary.categories[0].album).toBe(album);
    expect(summary.expense).toBe(95);
    expect(summary.income).toBe(99);
  });

  it('Household lists an album as one line, its entries under it alone', () => {
    const rows = [
      { id: 'a', categoryId: 'food', amount: 30 },
      { id: 'b', categoryId: 'food', amount: 50 },
      { id: 'c', categoryId: 'transport', amount: 15 },
    ].map((row) => ({
      ...row,
      type: 'expense' as const,
      reportingAmount: null,
      date: '2026-10-03T10:00:00',
      memberId: null,
      deletedAt: null,
    }));
    const index = buildHouseholdIndex(rows, () => OWNER_KEY, 1);
    const month = buildHouseholdMonth({
      index,
      monthKey: '2026-10',
      peopleOrder: [OWNER_KEY],
      categoriesById: BY_ID,
      albumIdOf: (id) => (id === 'b' ? 'bali' : null),
    });
    expect(month.categories.map((row) => [row.id, row.amount, row.transactionIds])).toEqual([
      [albumLineId('bali'), 50, ['b']],
      ['food', 30, ['a']],
      ['transport', 15, ['c']],
    ]);
    expect(month.total).toBe(95);
  });
});
