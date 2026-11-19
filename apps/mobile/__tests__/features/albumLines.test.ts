import { describeActivity } from '~/features/albums/lib/activityLines';
import { albumCategoryRows } from '~/features/albums/lib/albumBreakdown';
import {
  type AlbumCategoryDef,
  albumCategoryForCategory,
  albumCategoryForText,
  albumCategoryId,
  albumCategoryKeyOfId,
  albumCategoryLook,
  albumCategoryPickerList,
  keptAlbumCategoryList,
  personalCategoryFor,
} from '~/features/albums/lib/albumCategories';
import {
  albumIdOfLine,
  albumInitial,
  albumLineId,
  oneLinkPerEntry,
} from '~/features/albums/lib/albumLines';
import {
  albumCategoryColumns,
  albumCategoryList,
  albumCategoryOf,
  categoryRowId,
} from '~/features/albums/lib/groupPlan';
import { categoryRow } from '~/features/albums/lib/groupRows';
import { buildBudgetSummary } from '~/features/budget/lib/budgetMath';
import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import { buildReviewSummary } from '~/features/review/lib/reviewMath';
import { lastCompletedPeriod } from '~/features/review/lib/reviewPeriods';
import {
  buildHouseholdIndex,
  buildHouseholdMonth,
  OWNER_KEY,
} from '~/features/sharedLedgers/lib/householdMath';
import type { AlbumActivity, Category, PeriodBudget, TransactionWithRelations } from '~/types';

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

describe('a restored backup’s album links', () => {
  it('keep one live link per entry: its shared album’s, else the lowest id, never a deleted album’s', () => {
    const link = (id: string, album: string, entry: string, deleted: string | null = null) => ({
      id,
      album_id: album,
      transaction_id: entry,
      deleted_at: deleted,
    });
    const links = [
      link('b', 'bali', 't1'),
      link('a', 'tokyo', 't1'),
      link('a2', 'gone', 't2'),
      link('c', 'bali', 't2'),
      link('d', 'bali', 't3'),
      link('e', 'ski', 't3'),
      link('f', 'bali', 't4', 'then'),
    ];
    const out = oneLinkPerEntry(
      links,
      new Set(['bali', 'tokyo', 'ski']),
      new Map([['t3', 'ski']]),
      'now',
    );
    expect(out.filter((row) => row.deleted_at == null).map((row) => row.id)).toEqual([
      'a',
      'c',
      'e',
    ]);
    expect(out.find((row) => row.id === 'f')?.deleted_at).toBe('then');
    expect(out.find((row) => row.id === 'b')?.deleted_at).toBe('now');
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

describe('an album’s own categories', () => {
  // Food renamed Meals (its icon kept), Groceries removed, Tickets and
  // Coffee added, Other renamed Misc.
  const ALBUM: AlbumCategoryDef[] = albumCategoryList([
    { key: 'food', name: 'Meals', sort_order: 0 },
    { key: 'groceries', deleted_at: '2026-11-19T00:00:00.000Z' },
    { key: 'c-tickets01', name: 'Tickets', icon: 'emoji:🎟️', sort_order: 1 },
    { key: 'c-coffee001', name: 'coffee', icon: 'cup', sort_order: 2 },
    { key: 'other', name: 'Misc' },
  ]);

  it('list the defaults as the album changed them, then the ones it added', () => {
    expect(albumCategoryPickerList(ALBUM).map((item) => [item.id, item.name, item.icon])).toEqual([
      [albumCategoryId('food'), 'Meals', 'meal'],
      [albumCategoryId('c-tickets01'), 'Tickets', 'emoji:🎟️'],
      [albumCategoryId('c-coffee001'), 'coffee', 'cup'],
      [albumCategoryId('transport'), 'Transport', 'car'],
      [albumCategoryId('housing'), 'Housing', 'house'],
      [albumCategoryId('bills'), 'Bills', 'light-bulb'],
      [albumCategoryId('healthcare'), 'Healthcare', 'medicine'],
      [albumCategoryId('shopping'), 'Shopping', 'shopping-bag'],
      [albumCategoryId('other'), 'Misc', 'invoice'],
    ]);
    expect(albumCategoryKeyOfId(albumCategoryId('c-tickets01'))).toBe('c-tickets01');
  });

  it('file a bill under the user’s category of that name, else of that icon, else Other', () => {
    const own = (key: string) => personalCategoryFor(key, CATEGORIES, {}, ALBUM);
    // Meals keeps Food’s icon: the user’s category with it.
    expect(own('food')).toBe('food');
    // An added one, by name (any case), else nothing of the user’s: Other.
    expect(own('c-coffee001')).toBe('coffee');
    expect(own('c-tickets01')).toBe('other');
    // A default the album left as it is goes by Quick Entry, as before.
    expect(own('transport')).toBe('transport');
    // And back: the user’s Coffee reads as the album’s coffee.
    expect(albumCategoryForCategory('coffee', CATEGORIES, {}, ALBUM)).toBe('c-coffee001');
  });

  it('are picked from a title only onto a default the album left as it is', () => {
    expect(albumCategoryForText('Grab to airport', ALBUM)).toBe('transport');
    // Food is now Meals: its keywords no longer say what it means.
    expect(albumCategoryForText('Lunch', ALBUM)).toBeNull();
    expect(albumCategoryForText('Lunch')).toBe('food');
  });

  it('keep an added or changed category’s name and icon on the user’s entry', () => {
    const def = (key: string) => ALBUM.find((item) => item.key === key)!;
    expect(albumCategoryLook(def('c-tickets01'))).toEqual({ name: 'Tickets', icon: 'emoji:🎟️' });
    expect(albumCategoryLook(def('food'))).toEqual({ name: 'Meals', icon: null });
    expect(albumCategoryLook(def('transport'))).toEqual({ name: null, icon: null });
  });

  it('send an added one’s name and icon with the bill', () => {
    expect(
      albumCategoryColumns('c-tickets01', {
        category_name: '  Tickets ',
        category_icon: 'emoji:🎟️',
      }),
    ).toEqual({ category_key: 'c-tickets01', category_name: 'Tickets', category_icon: 'emoji:🎟️' });
    // No upload: another phone could not draw it.
    expect(
      albumCategoryColumns('c-tickets01', {
        category_name: 'Tickets',
        category_icon: 'custom:category-icons/x.png',
      }).category_icon,
    ).toBe('invoice');
    // A key of neither kind is Other.
    expect(albumCategoryColumns('nope').category_key).toBe('other');
  });

  it('log what changed, by name', () => {
    const line = (change: AlbumActivity['category']) =>
      describeActivity(
        {
          id: 'a1',
          groupId: 'bali',
          kind: 'category_changed',
          actorMemberId: 'tess',
          expenseId: null,
          memberId: null,
          bill: null,
          rename: null,
          payment: null,
          category: change,
          simplify: null,
          started: false,
          sortOrder: 0,
          createdAt: '2026-11-19T10:00:00.000Z',
        },
        { selfId: 'me', nameOf: () => 'Tess', money: String, day: String },
      ).text;
    const none = { name: null, icon: null };
    expect(line({ key: 'food', before: none, after: { name: 'Meals', icon: null } })).toBe(
      'Tess renamed the category Food to Meals',
    );
    expect(line({ key: 'c-t', before: null, after: { name: 'Tickets', icon: 'cup' } })).toBe(
      'Tess added the category Tickets',
    );
    expect(line({ key: 'groceries', before: none, after: null })).toBe(
      'Tess removed the category Groceries',
    );
    expect(line({ key: 'food', before: none, after: { name: null, icon: 'cup' } })).toBe(
      'Tess changed the icon of Food',
    );
  });

  it('show an album no longer shared under the names its entries keep, a renamed default too', () => {
    const rows = albumCategoryRows(
      [
        tx('b1', 30, 'food', {
          albumCategory: 'food',
          categoryName: 'Meals',
          categoryIcon: 'meal',
        }),
      ],
      {
        valueOf: (item) => item.amount,
        categories: CATEGORIES,
        categoryById: BY_ID,
        byAlbumCategory: true,
      },
    );
    expect(rows.map((row) => row.label)).toEqual(['Meals']);
    expect(
      keptAlbumCategoryList({
        albumCategory: 'c-snack001',
        albumCategoryName: 'Snacks',
        albumCategoryIcon: 'cookie',
      })
        .map((item) => item.key)
        .slice(-1),
    ).toEqual(['c-snack001']);
  });

  it('send only what changes, so a move never undoes another phone’s rename', () => {
    expect(categoryRow('bali', { key: 'food', sortOrder: 3 }).row).toEqual({
      id: categoryRowId('bali', 'food'),
      key: 'food',
      sort_order: 3,
    });
  });

  it('group a breakdown under the album’s names', () => {
    const rows = albumCategoryRows(
      [
        tx('b1', 30, 'food', { albumCategory: 'food' }),
        tx('b2', 20, 'other', { albumCategory: 'c-tickets01' }),
        // An album no longer shared: the name and icon the entry keeps.
        tx('b3', 5, 'other', {
          albumCategory: 'c-gone0001',
          categoryName: 'Snorkel',
          categoryIcon: 'emoji:🤿',
        }),
      ],
      {
        valueOf: (item) => item.amount,
        categories: CATEGORIES,
        categoryById: BY_ID,
        byAlbumCategory: true,
        albumCategories: ALBUM,
      },
    );
    expect(rows.map((row) => [row.label, row.emoji, row.amount])).toEqual([
      ['Meals', 'meal', 30],
      ['Tickets', 'emoji:🎟️', 20],
      ['Snorkel', 'emoji:🤿', 5],
    ]);
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
    tx('none', 7, null),
  ];

  it('groups an album of the user’s own by their root categories', () => {
    const rows = albumCategoryRows(entries, {
      valueOf: (item) => item.amount,
      categories: CATEGORIES,
      categoryById: BY_ID,
      byAlbumCategory: false,
    });
    // An entry with no category has a row too, so the rows add up to the album's line.
    expect(rows.map((row) => [row.id, row.label, row.amount, row.count])).toEqual([
      ['food', 'Makan', 42, 2],
      ['transport', 'Transport', 20, 1],
      ['__uncategorized__', 'Uncategorized', 7, 1],
      ['other', 'Other', 5, 1],
    ]);
    expect(rows[0].categoryRootId).toBe('food');
  });

  it('groups a shared album, or one no longer shared, by the album category each entry keeps', () => {
    // A bill's entries (and the entries its paid parts made) carry the
    // bill's category, and keep it after the user leaves the album.
    const stamped = entries.map((item) =>
      item.id === 'b1'
        ? { ...item, albumCategory: 'groceries' as const }
        : item.id === 'b2' || item.id === 'part1'
          ? { ...item, albumCategory: 'transport' as const }
          : item,
    );
    const rows = albumCategoryRows(stamped, {
      valueOf: (item) => (item.id === 'b1' ? null : item.amount),
      categories: CATEGORIES,
      categoryById: BY_ID,
      byAlbumCategory: true,
    });
    // b1 is left out (one person's breakdown with no share in it); the user's
    // own entry reads as the album category its category stands for.
    expect(rows.map((row) => [row.id, row.label, row.amount, row.categoryRootId])).toEqual([
      [albumCategoryId('transport'), 'Transport', 25, null],
      [albumCategoryId('food'), 'Food', 12, null],
      [albumCategoryId('other'), 'Other', 7, null],
    ]);
    // Everyone's: the bill's own category, whatever the user's says.
    const everyone = albumCategoryRows(stamped, {
      valueOf: (item) => item.amount,
      categories: CATEGORIES,
      categoryById: BY_ID,
      byAlbumCategory: true,
    });
    expect(everyone.find((row) => row.id === albumCategoryId('groceries'))?.amount).toBe(30);
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
    const album = { id: 'bali', name: 'Bali', icon: 'emoji:🏝️' };
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
