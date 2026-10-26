import {
  buildBudgetMonthPage,
  buildBudgetSummary,
  childAllocationExceedsParent,
  computeAllocationRemaining,
  computeBackPopulateRange,
  computeBudgetPagerMonths,
  computeChildAllocationGap,
  countRootAllocations,
  pickAutoCreateTemplate,
} from '~/features/budget/lib/budgetMath';
import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import type { BudgetTemplate, Category, PeriodBudget, TransactionWithRelations } from '~/types';

function makeTransaction(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 't1',
    type: 'expense',
    amount: 10,
    currency: 'USD',
    date: '2026-07-10T12:00:00.000Z',
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
    ...NO_REIMBURSEMENT,
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
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
    icon: '🍔',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

function makeBudget(overrides: Partial<PeriodBudget>): PeriodBudget {
  return {
    id: 'b1',
    period: 'month',
    periodKey: '2026-07',
    templateId: 'tpl1',
    templateName: 'Everyday',
    templateEmoji: null,
    totalAmount: 1000,
    countUnbudgeted: true,
    lines: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<BudgetTemplate>): BudgetTemplate {
  return {
    id: 'tpl1',
    name: 'Everyday',
    emoji: null,
    period: 'month',
    totalAmount: 1000,
    isDefault: false,
    countUnbudgeted: true,
    sortOrder: 0,
    allocations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('buildBudgetSummary', () => {
  const categories = [
    makeCategory('food'),
    makeCategory('food-coffee', 'food'),
    makeCategory('transport'),
    makeCategory('fun'),
  ];

  const budget = makeBudget({
    totalAmount: 1000,
    lines: [
      { id: 'l1', categoryId: 'food', amount: 600, sortOrder: 0 },
      { id: 'l2', categoryId: 'transport', amount: 400, sortOrder: 1 },
    ],
  });

  it('returns null when there is no budget for the month', () => {
    expect(buildBudgetSummary({ budget: null, transactions: [], categories })).toBeNull();
  });

  it('buckets spend into budget lines and rolls subcategories up to the root', () => {
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 100 }),
      makeTransaction({ id: 'b', categoryId: 'food-coffee', amount: 50 }),
      makeTransaction({ id: 'c', categoryId: 'transport', amount: 30 }),
    ];
    const summary = buildBudgetSummary({ budget, transactions, categories });
    expect(summary).not.toBeNull();
    const food = summary!.categories.find((c) => c.categoryId === 'food');
    expect(food).toMatchObject({ budgeted: 600, spent: 150, remaining: 450, isOver: false });
    expect(summary!.budgetedSpent).toBe(180);
    expect(summary!.unbudgetedSpent).toBe(0);
    expect(summary!.totalSpent).toBe(180);
    expect(summary!.remaining).toBe(820);
    expect(summary!.exceededBy).toBe(0);
  });

  it('collects unbudgeted spend from non-budgeted categories and uncategorized', () => {
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'fun', amount: 75 }),
      makeTransaction({ id: 'b', categoryId: null, amount: 25 }),
    ];
    const summary = buildBudgetSummary({ budget, transactions, categories });
    expect(summary!.unbudgetedSpent).toBe(100);
    expect(summary!.unbudgeted).toEqual([
      { categoryId: 'fun', spent: 75 },
      { categoryId: null, spent: 25 },
    ]);
    expect(summary!.totalSpent).toBe(100);
  });

  it('flags over-budget lines and reports the exceeded amount', () => {
    const transactions = [makeTransaction({ id: 'a', categoryId: 'food', amount: 1200 })];
    const summary = buildBudgetSummary({ budget, transactions, categories });
    const food = summary!.categories.find((c) => c.categoryId === 'food');
    expect(food!.isOver).toBe(true);
    expect(food!.remaining).toBe(-600);
    expect(summary!.remaining).toBe(-200);
    expect(summary!.exceededBy).toBe(200);
  });

  it('values spend at the frozen reporting amount when present', () => {
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 500, reportingAmount: 120 }),
    ];
    const summary = buildBudgetSummary({ budget, transactions, categories });
    expect(summary!.categories.find((c) => c.categoryId === 'food')!.spent).toBe(120);
  });

  it('ignores other months, deleted transactions, and non-expense types', () => {
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', date: '2026-06-15T12:00:00.000Z' }),
      makeTransaction({ id: 'b', categoryId: 'food', deletedAt: '2026-07-11T00:00:00.000Z' }),
      makeTransaction({ id: 'c', categoryId: 'food', type: 'income', amount: 999 }),
    ];
    const summary = buildBudgetSummary({ budget, transactions, categories });
    expect(summary!.totalSpent).toBe(0);
  });

  it('drops budget lines whose category no longer exists', () => {
    const staleBudget = makeBudget({
      lines: [{ id: 'l1', categoryId: 'ghost', amount: 300, sortOrder: 0 }],
    });
    const summary = buildBudgetSummary({
      budget: staleBudget,
      transactions: [],
      categories,
    });
    expect(summary!.categories).toEqual([]);
  });

  it('excludes unbudgeted spend from the total when the budget does not count it', () => {
    const noCountBudget = makeBudget({
      countUnbudgeted: false,
      lines: [{ id: 'l1', categoryId: 'food', amount: 600, sortOrder: 0 }],
    });
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 100 }),
      makeTransaction({ id: 'b', categoryId: 'fun', amount: 75 }),
      makeTransaction({ id: 'c', categoryId: null, amount: 25 }),
    ];
    const summary = buildBudgetSummary({
      budget: noCountBudget,
      transactions,
      categories,
    });
    expect(summary!.countUnbudgeted).toBe(false);
    expect(summary!.budgetedSpent).toBe(100);
    expect(summary!.unbudgetedSpent).toBe(100); // still reported...
    expect(summary!.totalSpent).toBe(100); // ...but not counted
    expect(summary!.remaining).toBe(900);
  });

  it('nests subcategory lines under their root with own (non-rolled-up) spend', () => {
    const nestedBudget = makeBudget({
      lines: [
        { id: 'l1', categoryId: 'food', amount: 600, sortOrder: 0 },
        { id: 'l2', categoryId: 'food-coffee', amount: 150, sortOrder: 1 },
      ],
    });
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 100 }),
      makeTransaction({ id: 'b', categoryId: 'food-coffee', amount: 160 }),
    ];
    const summary = buildBudgetSummary({
      budget: nestedBudget,
      transactions,
      categories,
    });
    // Only the root line is a top-level row; the child nests inside it.
    expect(summary!.categories.map((line) => line.categoryId)).toEqual(['food']);
    const food = summary!.categories[0];
    expect(food.spent).toBe(260); // parent still rolls everything up
    expect(food.children).toHaveLength(1);
    expect(food.children[0]).toMatchObject({
      categoryId: 'food-coffee',
      budgeted: 150,
      spent: 160, // own spend only
      isOver: true,
    });
    // budgetedSpent counts root roll-ups once, not root + child double-counting.
    expect(summary!.budgetedSpent).toBe(260);
  });

  it('drops child lines whose parent has no budget line', () => {
    const orphanBudget = makeBudget({
      lines: [
        { id: 'l1', categoryId: 'transport', amount: 400, sortOrder: 0 },
        { id: 'l2', categoryId: 'food-coffee', amount: 150, sortOrder: 1 }, // parent food unbudgeted
      ],
    });
    const summary = buildBudgetSummary({
      budget: orphanBudget,
      transactions: [makeTransaction({ id: 'a', categoryId: 'food-coffee', amount: 50 })],
      categories,
    });
    expect(summary!.categories.map((line) => line.categoryId)).toEqual(['transport']);
    // The orphan's spend still shows up as unbudgeted (rolled to its root).
    expect(summary!.unbudgeted).toEqual([{ categoryId: 'food', spent: 50 }]);
  });

  it('renders a zero-activity month as all-zero usage', () => {
    const summary = buildBudgetSummary({
      budget,
      transactions: [],
      categories,
    });
    expect(summary!.usageRatio).toBe(0);
    expect(summary!.remaining).toBe(1000);
  });
});

const CLOCK = { weekStartsOn: 1 as const, monthCycle: 1 };

describe('computeBackPopulateRange', () => {
  const now = new Date(2026, 6, 15); // July 2026
  const monthly = { period: 'month' as const, clock: CLOCK };

  it('returns null with no expense history', () => {
    expect(
      computeBackPopulateRange({ ...monthly, transactions: [], existingKeys: [], now }),
    ).toBeNull();
    const incomeOnly = [makeTransaction({ type: 'income', date: '2026-03-01T12:00:00.000Z' })];
    expect(
      computeBackPopulateRange({ ...monthly, transactions: incomeOnly, existingKeys: [], now }),
    ).toBeNull();
  });

  it('returns null when the first expense is in the current month', () => {
    const transactions = [makeTransaction({ date: '2026-07-02T12:00:00.000Z' })];
    expect(
      computeBackPopulateRange({ ...monthly, transactions, existingKeys: [], now }),
    ).toBeNull();
  });

  it('spans from the first expense month through last month', () => {
    const transactions = [
      makeTransaction({ id: 'a', date: '2026-03-20T12:00:00.000Z' }),
      makeTransaction({ id: 'b', date: '2026-05-02T12:00:00.000Z' }),
    ];
    const range = computeBackPopulateRange({ ...monthly, transactions, existingKeys: [], now });
    expect(range!.keys).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
    expect(range!.firstKey).toBe('2026-03');
    expect(range!.lastKey).toBe('2026-06');
  });

  it('skips months that already have a live budget', () => {
    const transactions = [makeTransaction({ date: '2026-03-20T12:00:00.000Z' })];
    const range = computeBackPopulateRange({
      ...monthly,
      transactions,
      existingKeys: ['2026-04', '2026-06'],
      now,
    });
    expect(range!.keys).toEqual(['2026-03', '2026-05']);
  });

  it('returns null when every past month is already covered', () => {
    const transactions = [makeTransaction({ date: '2026-05-20T12:00:00.000Z' })];
    expect(
      computeBackPopulateRange({
        ...monthly,
        transactions,
        existingKeys: ['2026-05', '2026-06'],
        now,
      }),
    ).toBeNull();
  });

  it('crosses year boundaries', () => {
    const transactions = [makeTransaction({ date: '2025-11-20T12:00:00.000Z' })];
    const range = computeBackPopulateRange({
      ...monthly,
      transactions,
      existingKeys: [],
      now: new Date(2026, 1, 10),
    });
    expect(range!.keys).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('pickAutoCreateTemplate', () => {
  it('skips when the current month has or ever had a budget', () => {
    expect(
      pickAutoCreateTemplate({
        period: 'month',
        currentPeriodHasEverHadBudget: true,
        templates: [makeTemplate({ isDefault: true })],
      }),
    ).toBeNull();
  });

  it('skips when no templates exist', () => {
    expect(
      pickAutoCreateTemplate({
        period: 'month',
        currentPeriodHasEverHadBudget: false,
        templates: [],
      }),
    ).toBeNull();
  });

  it('picks the default template', () => {
    const templates = [makeTemplate({ id: 'a' }), makeTemplate({ id: 'b', isDefault: true })];
    expect(
      pickAutoCreateTemplate({ period: 'month', currentPeriodHasEverHadBudget: false, templates })!
        .id,
    ).toBe('b');
  });

  it('falls back to the first template when none is flagged default', () => {
    const templates = [makeTemplate({ id: 'a' }), makeTemplate({ id: 'b' })];
    expect(
      pickAutoCreateTemplate({ period: 'month', currentPeriodHasEverHadBudget: false, templates })!
        .id,
    ).toBe('a');
  });
});

describe('computeAllocationRemaining', () => {
  it('reports the unallocated remainder', () => {
    expect(computeAllocationRemaining(1000, [{ amount: 600 }, { amount: 300 }])).toBe(100);
  });

  it('is exactly zero despite float dust', () => {
    expect(computeAllocationRemaining(800, [{ amount: 799.99 }, { amount: 0.01 }])).toBe(0);
    expect(computeAllocationRemaining(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(0);
  });

  it('goes negative when over-allocated', () => {
    expect(computeAllocationRemaining(100, [{ amount: 150 }])).toBe(-50);
  });
});

describe('computeChildAllocationGap', () => {
  it('is zero when no child is allocated (children are optional)', () => {
    expect(computeChildAllocationGap(500, [])).toBe(0);
    expect(computeChildAllocationGap(500, [{ amount: 0 }, { amount: 0 }])).toBe(0);
  });

  it('reports the unassigned remainder while children are partially allocated', () => {
    expect(computeChildAllocationGap(500, [{ amount: 200 }, { amount: 100 }])).toBe(200);
  });

  it('is exactly zero when children sum to the parent despite float dust', () => {
    expect(computeChildAllocationGap(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(0);
  });

  it('goes negative when children exceed the parent', () => {
    expect(computeChildAllocationGap(100, [{ amount: 150 }])).toBe(-50);
  });
});

describe('childAllocationExceedsParent', () => {
  it('allows a partial breakdown, leaving the rest on the parent', () => {
    expect(childAllocationExceedsParent(200, [{ amount: 120 }])).toBe(false);
  });

  it('allows no breakdown and an exact breakdown', () => {
    expect(childAllocationExceedsParent(200, [])).toBe(false);
    expect(childAllocationExceedsParent(200, [{ amount: 120 }, { amount: 80 }])).toBe(false);
  });

  it('blocks a breakdown larger than the parent', () => {
    expect(childAllocationExceedsParent(200, [{ amount: 120 }, { amount: 90 }])).toBe(true);
  });

  it('blocks child amounts on a parent with no amount', () => {
    expect(childAllocationExceedsParent(0, [{ amount: 50 }])).toBe(true);
  });
});

describe('countRootAllocations', () => {
  const categories = [
    makeCategory('food'),
    makeCategory('groceries', 'food'),
    makeCategory('dining', 'food'),
    makeCategory('transport'),
  ];

  it('counts only root allocations, not subcategory breakdown rows', () => {
    const allocations = [
      { categoryId: 'food' },
      { categoryId: 'groceries' },
      { categoryId: 'dining' },
      { categoryId: 'transport' },
    ];
    expect(countRootAllocations(allocations, categories)).toBe(2);
  });

  it('counts an allocation for an unknown category as a root', () => {
    expect(countRootAllocations([{ categoryId: 'ghost' }], categories)).toBe(1);
  });
});

describe('computeBudgetPagerMonths', () => {
  const now = new Date(2026, 6, 15); // July 2026

  it('spans current month through a year ahead with no history', () => {
    const months = computeBudgetPagerMonths({
      clock: CLOCK,
      budgets: [],
      transactions: [],
      now,
    });
    expect(months[0]).toBe('2026-07');
    expect(months[months.length - 1]).toBe('2027-07');
    expect(months).toHaveLength(13);
  });

  it('starts at the earliest budget or expense month', () => {
    const budgets = [makeBudget({ periodKey: '2026-05' })];
    const transactions = [makeTransaction({ date: '2026-04-10T12:00:00.000Z' })];
    const months = computeBudgetPagerMonths({
      clock: CLOCK,
      budgets,
      transactions,
      now,
    });
    expect(months[0]).toBe('2026-04');
    expect(months).toContain('2026-05');
    expect(months[months.length - 1]).toBe('2027-07');
  });

  it('extends past the future window to reach an existing later budget', () => {
    const budgets = [makeBudget({ periodKey: '2027-10' })];
    const months = computeBudgetPagerMonths({
      clock: CLOCK,
      budgets,
      transactions: [],
      now,
    });
    expect(months[months.length - 1]).toBe('2027-10');
  });
});

describe('buildBudgetSummary — custom first day of month', () => {
  const categories = [makeCategory('food')];
  const budget = makeBudget({
    totalAmount: 1000,
    lines: [{ id: 'l1', categoryId: 'food', amount: 600, sortOrder: 0 }],
  });

  it('buckets a mid-month spend into the previous financial month when firstDay = 25', () => {
    // July 10 falls before the 25th, so with a 25th cycle start it belongs to
    // the financial month labelled June (2026-06), not July.
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 100, date: '2026-07-10' }),
    ];
    const june = buildBudgetSummary({
      budget: makeBudget({ periodKey: '2026-06', lines: budget.lines }),
      transactions,
      categories,
      monthCycle: 25,
    });
    const july = buildBudgetSummary({
      budget,
      transactions,
      categories,
      monthCycle: 25,
    });
    expect(june?.totalSpent).toBe(100);
    expect(july?.totalSpent).toBe(0);
  });

  it('buckets a spend on/after the cycle start into the current financial month', () => {
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 100, date: '2026-07-26' }),
    ];
    const july = buildBudgetSummary({
      budget,
      transactions,
      categories,
      monthCycle: 25,
    });
    expect(july?.totalSpent).toBe(100);
  });

  it('matches calendar-month bucketing when firstDay = 1', () => {
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 100, date: '2026-07-10' }),
    ];
    const withDefault = buildBudgetSummary({
      budget,
      transactions,
      categories,
      monthCycle: 1,
    });
    const withoutParam = buildBudgetSummary({
      budget,
      transactions,
      categories,
    });
    expect(withDefault?.totalSpent).toBe(100);
    expect(withoutParam?.totalSpent).toBe(100);
  });
});

describe('weekly and yearly budgets', () => {
  const categories = [makeCategory('food')];
  const lines = [{ id: 'l1', categoryId: 'food', amount: 100, sortOrder: 0 }];

  it('counts only spend inside the budget week (Mon 26 Oct – Sun 1 Nov)', () => {
    const budget = makeBudget({ period: 'week', periodKey: '2026-10-26', totalAmount: 100, lines });
    const transactions = [
      makeTransaction({ id: 'before', categoryId: 'food', amount: 5, date: '2026-10-25' }),
      makeTransaction({ id: 'first', categoryId: 'food', amount: 10, date: '2026-10-26' }),
      makeTransaction({ id: 'last', categoryId: 'food', amount: 20, date: '2026-11-01' }),
      makeTransaction({ id: 'after', categoryId: 'food', amount: 40, date: '2026-11-02' }),
    ];
    const summary = buildBudgetSummary({ budget, transactions, categories });
    expect(summary).toMatchObject({ period: 'week', periodKey: '2026-10-26', totalSpent: 30 });
  });

  it('counts a whole calendar year for a yearly budget', () => {
    const budget = makeBudget({ period: 'year', periodKey: '2026', totalAmount: 5000, lines });
    const transactions = [
      makeTransaction({ id: 'a', categoryId: 'food', amount: 10, date: '2025-12-31' }),
      makeTransaction({ id: 'b', categoryId: 'food', amount: 20, date: '2026-01-01' }),
      makeTransaction({ id: 'c', categoryId: 'food', amount: 30, date: '2026-12-31' }),
    ];
    // A month cycle does not move the year's edges.
    const summary = buildBudgetSummary({ budget, transactions, categories, monthCycle: 25 });
    expect(summary!.totalSpent).toBe(50);
  });

  it('back-fills past weeks from the week of the first expense', () => {
    const range = computeBackPopulateRange({
      period: 'week',
      clock: CLOCK,
      transactions: [makeTransaction({ date: '2026-10-08' })], // a Thursday
      existingKeys: ['2026-10-12'],
      now: new Date(2026, 9, 28),
    });
    expect(range!.keys).toEqual(['2026-10-05', '2026-10-19']);
  });

  it('treats a week budget made under another first weekday as taking its week', () => {
    // A Sunday-start week (18 Oct) falls in the Monday-start week of 12 Oct.
    const range = computeBackPopulateRange({
      period: 'week',
      clock: CLOCK,
      transactions: [makeTransaction({ date: '2026-10-13' })],
      existingKeys: ['2026-10-18'],
      now: new Date(2026, 9, 28),
    });
    expect(range!.keys).toEqual(['2026-10-19']);
  });

  it('back-fills past years', () => {
    const range = computeBackPopulateRange({
      period: 'year',
      clock: CLOCK,
      transactions: [makeTransaction({ date: '2024-03-01' })],
      existingKeys: [],
      now: new Date(2026, 9, 28),
    });
    expect(range!.keys).toEqual(['2024', '2025']);
  });

  it('picks only templates of the requested period', () => {
    const templates = [
      makeTemplate({ id: 'm', isDefault: true }),
      makeTemplate({ id: 'w1', period: 'week' }),
      makeTemplate({ id: 'w2', period: 'week', isDefault: true }),
    ];
    expect(
      pickAutoCreateTemplate({ period: 'week', currentPeriodHasEverHadBudget: false, templates })!
        .id,
    ).toBe('w2');
    expect(
      pickAutoCreateTemplate({ period: 'year', currentPeriodHasEverHadBudget: false, templates }),
    ).toBeNull();
  });

  it('stretches the month pager to cover week and year budgets', () => {
    const months = computeBudgetPagerMonths({
      clock: CLOCK,
      budgets: [
        makeBudget({ period: 'week', periodKey: '2026-03-30' }), // 30 Mar – 5 Apr
        makeBudget({ period: 'year', periodKey: '2028' }),
      ],
      transactions: [],
      now: new Date(2026, 9, 28),
    });
    expect(months[0]).toBe('2026-03');
    // A year reaches the pager only through its first month.
    expect(months[months.length - 1]).toBe('2028-01');
  });

  it('builds a month page from the month, its weeks and its year', () => {
    const page = buildBudgetMonthPage({
      monthKey: '2026-10',
      clock: CLOCK,
      budgets: [
        makeBudget({ id: 'm', periodKey: '2026-10' }),
        makeBudget({ id: 'other-month', periodKey: '2026-09' }),
        makeBudget({ id: 'w1', period: 'week', periodKey: '2026-09-28' }),
        makeBudget({ id: 'w-sunday', period: 'week', periodKey: '2026-10-18' }), // lands on 12 Oct
        makeBudget({ id: 'w-gone', period: 'week', periodKey: '2026-10-19', deletedAt: 'x' }),
        makeBudget({ id: 'y', period: 'year', periodKey: '2026' }),
      ],
    });
    expect(page.month?.id).toBe('m');
    expect(page.year?.id).toBe('y');
    expect(page.weeks.map((week) => [week.key, week.budget?.id ?? null])).toEqual([
      ['2026-09-28', 'w1'],
      ['2026-10-05', null],
      ['2026-10-12', 'w-sunday'],
      ['2026-10-19', null],
      ['2026-10-26', null],
    ]);
  });
});
