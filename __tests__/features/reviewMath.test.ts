import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import {
  buildReviewSummary,
  expenseTotalForPeriod,
  UNCATEGORIZED_ID,
} from '~/features/review/lib/reviewMath';
import {
  lastCompletedPeriod,
  listCompletedPeriods,
  MAX_REVIEW_PERIODS,
  periodContains,
  shiftPeriod,
  startOfWeekFor,
} from '~/features/review/lib/reviewPeriods';
import type { Category, TransactionWithRelations, WeekStartsOn } from '~/types';

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
    accountId: null,
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

// Thursday 6 Aug 2026.
const TODAY = new Date(2026, 7, 6);

describe('reviewPeriods — only completed periods', () => {
  it('returns the week before the one in progress, honouring weekStartsOn', () => {
    // weekStartsOn = 1 (Monday): the running week is Mon 3 Aug .. Sun 9 Aug.
    const monday = lastCompletedPeriod({
      zoom: 'week',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    expect(monday).toMatchObject({ start: '2026-07-27', end: '2026-08-02' });

    // weekStartsOn = 0 (Sunday): the running week is Sun 2 Aug .. Sat 8 Aug.
    const sunday = lastCompletedPeriod({
      zoom: 'week',
      today: TODAY,
      weekStartsOn: 0,
      monthCycle: 1,
    });
    expect(sunday).toMatchObject({ start: '2026-07-26', end: '2026-08-01' });
  });

  it('never includes today, whichever day of the week it is', () => {
    for (let offset = 0; offset < 14; offset += 1) {
      const today = new Date(2026, 7, 1 + offset);
      for (let start = 0; start < 7; start += 1) {
        const period = lastCompletedPeriod({
          zoom: 'week',
          today,
          weekStartsOn: start as WeekStartsOn,
          monthCycle: 1,
        });
        expect(period.end < `2026-08-${String(1 + offset).padStart(2, '0')}`).toBe(true);
        expect(startOfWeekFor(today, start as WeekStartsOn).getDay()).toBe(start);
      }
    }
  });

  it('returns the previous financial month, shifted by firstDayOfMonth', () => {
    expect(
      lastCompletedPeriod({ zoom: 'month', today: TODAY, weekStartsOn: 1, monthCycle: 1 }),
    ).toMatchObject({ key: 'month:2026-07', start: '2026-07-01', end: '2026-07-31' });

    // With a payday cycle starting on the 15th, 6 Aug still sits in the July
    // cycle (15 Jul .. 14 Aug), so the last completed one is 15 Jun .. 14 Jul.
    expect(
      lastCompletedPeriod({ zoom: 'month', today: TODAY, weekStartsOn: 1, monthCycle: 15 }),
    ).toMatchObject({ key: 'month:2026-06', start: '2026-06-15', end: '2026-07-14' });
  });

  it('returns last calendar year, not the year in progress', () => {
    expect(
      lastCompletedPeriod({ zoom: 'year', today: TODAY, weekStartsOn: 1, monthCycle: 1 }),
    ).toMatchObject({ key: 'year:2025', start: '2025-01-01', end: '2025-12-31' });
  });

  it('walks back a whole step at a time', () => {
    const july = lastCompletedPeriod({
      zoom: 'month',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    expect(shiftPeriod(july, 1, 1)).toMatchObject({ key: 'month:2026-06' });
    expect(shiftPeriod(july, 7, 1)).toMatchObject({ key: 'month:2025-12' });
  });
});

describe('listCompletedPeriods', () => {
  const base = { today: TODAY, weekStartsOn: 1 as WeekStartsOn, monthCycle: 1 };

  it('stops at the earliest logged transaction and runs oldest first', () => {
    const periods = listCompletedPeriods({
      ...base,
      zoom: 'month',
      earliestTransactionDate: '2026-05-20',
    });
    expect(periods.map((period) => period.key)).toEqual([
      'month:2026-05',
      'month:2026-06',
      'month:2026-07',
    ]);
  });

  it('offers a single period for an empty ledger', () => {
    const periods = listCompletedPeriods({ ...base, zoom: 'week' });
    expect(periods).toHaveLength(1);
    expect(periods[0].end).toBe('2026-08-02');
  });

  it('caps a long history', () => {
    const periods = listCompletedPeriods({
      ...base,
      zoom: 'week',
      earliestTransactionDate: '2000-01-01',
    });
    expect(periods).toHaveLength(MAX_REVIEW_PERIODS.week);
  });

  it('never offers a period that has not finished', () => {
    for (const zoom of ['week', 'month', 'year'] as const) {
      const periods = listCompletedPeriods({
        ...base,
        zoom,
        earliestTransactionDate: '2020-01-01',
      });
      for (const period of periods) {
        expect(periodContains(period, '2026-08-06')).toBe(false);
        expect(period.end < '2026-08-06').toBe(true);
      }
    }
  });
});

describe('buildReviewSummary', () => {
  const period = lastCompletedPeriod({
    zoom: 'week',
    today: TODAY,
    weekStartsOn: 1,
    monthCycle: 1,
  });
  const categories = [makeCategory('food'), makeCategory('coffee', 'food'), makeCategory('rent')];

  const transactions = [
    makeTransaction({ id: 'a', date: '2026-07-27', amount: 40, categoryId: 'food' }),
    makeTransaction({ id: 'b', date: '2026-07-28', amount: 60, categoryId: 'coffee' }),
    makeTransaction({
      id: 'c',
      date: '2026-07-30',
      amount: 200,
      categoryId: 'rent',
      sentiment: 'sad',
    }),
    makeTransaction({ id: 'd', date: '2026-07-30', type: 'income', amount: 1000 }),
    // Outside the period — must be ignored entirely.
    makeTransaction({ id: 'e', date: '2026-08-03', amount: 999, categoryId: 'food' }),
    // Soft-deleted — must be ignored.
    makeTransaction({ id: 'f', date: '2026-07-29', amount: 500, deletedAt: '2026-07-29' }),
  ];

  const summary = buildReviewSummary({
    period,
    transactions,
    categories,
    hourlyRate: 25,
    previousExpenses: [400, 200, 300],
  });

  it('totals only live rows inside the period', () => {
    expect(summary.expense).toBe(300);
    expect(summary.income).toBe(1000);
    expect(summary.net).toBe(700);
    expect(summary.savedRatio).toBeCloseTo(0.7);
    expect(summary.isEmpty).toBe(false);
  });

  it('prefers the frozen reporting amount over the entered amount', () => {
    const fx = buildReviewSummary({
      period,
      transactions: [
        makeTransaction({ id: 'x', date: '2026-07-28', amount: 1200, reportingAmount: 250 }),
      ],
      categories,
      hourlyRate: 0,
    });
    expect(fx.expense).toBe(250);
  });

  it('reports the change against the previous period', () => {
    expect(summary.delta).toEqual({ previousExpense: 400, changeRatio: -0.25 });
  });

  it('has no delta when the previous period recorded nothing', () => {
    const first = buildReviewSummary({ period, transactions, categories, hourlyRate: 25 });
    expect(first.delta).toBeNull();
  });

  it('converts spend to hours of life at the period rate', () => {
    expect(summary.hours).toBe(12);
    const noWage = buildReviewSummary({ period, transactions, categories, hourlyRate: 0 });
    expect(noWage.hours).toBeNull();
  });

  it('builds one bar per day of a week and marks the peak', () => {
    expect(summary.bars).toHaveLength(7);
    expect(summary.bars.map((bar) => bar.value)).toEqual([40, 60, 0, 200, 0, 0, 0]);
    expect(summary.bars.filter((bar) => bar.isPeak).map((bar) => bar.start)).toEqual([
      '2026-07-30',
    ]);
    expect(summary.barAverage).toBeCloseTo(300 / 7);
  });

  it('rolls subcategory spend into its root category', () => {
    const food = summary.categories.find((category) => category.id === 'food');
    expect(food?.amount).toBe(100);
    expect(summary.categories[0].id).toBe('rent');
    expect(summary.categories[0].share).toBeCloseTo(200 / 300);
    expect(summary.categories[0].barRatio).toBe(1);
    expect(food?.barRatio).toBeCloseTo(0.5);
  });

  it('buckets uncategorised spend under a sentinel row', () => {
    const loose = buildReviewSummary({
      period,
      transactions: [makeTransaction({ id: 'u', date: '2026-07-28', amount: 30 })],
      categories,
      hourlyRate: 0,
    });
    expect(loose.categories[0].id).toBe(UNCATEGORIZED_ID);
    expect(loose.categories[0].amount).toBe(30);
  });

  it('splits expense by sentiment', () => {
    expect(summary.sentiment).toEqual([
      { sentiment: 'happy', amount: 0, share: 0 },
      { sentiment: 'neutral', amount: 100, share: 100 / 300 },
      { sentiment: 'sad', amount: 200, share: 200 / 300 },
    ]);
  });

  it('surfaces standouts over the whole period', () => {
    expect(summary.standouts.biggestExpense).toMatchObject({ id: 'c', amount: 200 });
    expect(summary.standouts.busiestDay).toMatchObject({ dayKey: '2026-07-30', count: 2 });
    expect(summary.standouts.totalDayCount).toBe(7);
    // 27, 28 and 30 Jul had entries; the other four days were quiet.
    expect(summary.standouts.quietDayCount).toBe(4);
    expect(summary.standouts.entryCount).toBe(4);
  });

  it('paces against a budget when one is set', () => {
    const paced = buildReviewSummary({
      period,
      transactions,
      categories,
      hourlyRate: 25,
      budgetTotal: 250,
    });
    expect(paced.pace).toMatchObject({ kind: 'budget', target: 250, state: 'over' });
    expect(paced.pace?.ratio).toBeCloseTo(1.2);
  });

  it('falls back to a trailing average, ignoring periods with no spend', () => {
    // 400/200/300 averages to 300, exactly this week's spend — dead on the line.
    expect(summary.pace).toMatchObject({ kind: 'average', sampleSize: 3, state: 'close' });
    expect(summary.pace?.target).toBeCloseTo(300);

    const light = buildReviewSummary({
      period,
      transactions,
      categories,
      hourlyRate: 25,
      previousExpenses: [900, 900],
    });
    expect(light.pace?.state).toBe('under');

    const sparse = buildReviewSummary({
      period,
      transactions,
      categories,
      hourlyRate: 25,
      previousExpenses: [0, 0, 600],
    });
    expect(sparse.pace).toMatchObject({ kind: 'average', sampleSize: 1, target: 600 });
  });

  it('has no pace card with neither a budget nor any history', () => {
    expect(
      buildReviewSummary({ period, transactions, categories, hourlyRate: 25 }).pace,
    ).toBeNull();
  });

  it('reports an empty period rather than throwing', () => {
    const empty = buildReviewSummary({ period, transactions: [], categories, hourlyRate: 25 });
    expect(empty.isEmpty).toBe(true);
    expect(empty.expense).toBe(0);
    expect(empty.savedRatio).toBeNull();
    expect(empty.bars.every((bar) => !bar.isPeak)).toBe(true);
    expect(empty.standouts.quietDayCount).toBe(7);
  });
});

describe('bar buckets per zoom', () => {
  const categories: Category[] = [];

  it('buckets a month into 7-day runs', () => {
    const july = lastCompletedPeriod({
      zoom: 'month',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    const summary = buildReviewSummary({
      period: july,
      transactions: [
        makeTransaction({ id: 'a', date: '2026-07-02', amount: 10 }),
        makeTransaction({ id: 'b', date: '2026-07-09', amount: 20 }),
        makeTransaction({ id: 'c', date: '2026-07-31', amount: 30 }),
      ],
      categories,
      hourlyRate: 0,
    });
    // 31 days -> five buckets, the last a 3-day stub.
    expect(summary.bars).toHaveLength(5);
    expect(summary.bars.map((bar) => bar.value)).toEqual([10, 20, 0, 0, 30]);
    expect(summary.bars[4]).toMatchObject({ start: '2026-07-29', end: '2026-07-31' });
  });

  it('averages a month over real weeks, not over the bucket count', () => {
    const july = lastCompletedPeriod({
      zoom: 'month',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    const summary = buildReviewSummary({
      period: july,
      transactions: [makeTransaction({ id: 'a', date: '2026-07-02', amount: 310 })],
      categories,
      hourlyRate: 0,
    });
    // 31 days is 4 3/7 weeks, so the last of the five buckets is a 3-day stub.
    // Dividing by 5 would report 62 and drop the chart's average line ~15% low.
    expect(summary.bars).toHaveLength(5);
    expect(summary.barAverage).toBeCloseTo(310 / (31 / 7));
    expect(summary.barAverage).toBeGreaterThan(310 / 5);
  });

  it('averages a week over its seven days', () => {
    const week = lastCompletedPeriod({
      zoom: 'week',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    const summary = buildReviewSummary({
      period: week,
      transactions: [makeTransaction({ id: 'a', date: '2026-07-28', amount: 70 })],
      categories,
      hourlyRate: 0,
    });
    expect(summary.barAverage).toBeCloseTo(10);
  });

  it('buckets a year into calendar months', () => {
    const year = lastCompletedPeriod({
      zoom: 'year',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    const summary = buildReviewSummary({
      period: year,
      transactions: [
        makeTransaction({ id: 'a', date: '2025-03-04', amount: 100 }),
        makeTransaction({ id: 'b', date: '2025-12-31', amount: 50 }),
      ],
      categories,
      hourlyRate: 0,
    });
    expect(summary.bars).toHaveLength(12);
    expect(summary.bars[2]).toMatchObject({ key: '2025-03', value: 100, isPeak: true });
    expect(summary.bars[11]).toMatchObject({ key: '2025-12', value: 50 });
  });
});

// `transaction.date` is stored as a full ISO timestamp, not a 'YYYY-MM-DD'
// key. Comparing it against a period bound raw drops the period's final day
// and gives every row its own day bucket, so the whole module must normalize.
describe('ISO timestamps in transaction.date', () => {
  const period = lastCompletedPeriod({
    zoom: 'month',
    today: TODAY,
    weekStartsOn: 1,
    monthCycle: 1,
  });

  // Built from a *local* wall-clock time so the day key these resolve to is
  // the same in every timezone. A literal UTC string would land on a different
  // local day either side of the date line and make the test machine-dependent.
  const isoAtLocal = (year: number, month1: number, day: number, hour: number, minute = 0) =>
    new Date(year, month1 - 1, day, hour, minute).toISOString();

  it('counts a transaction logged on the last day of the period', () => {
    const rows = [makeTransaction({ id: 'last', date: isoAtLocal(2026, 7, 31, 21), amount: 90 })];
    const summary = buildReviewSummary({
      period,
      transactions: rows,
      categories: [],
      hourlyRate: 0,
    });
    expect(summary.expense).toBe(90);
    expect(summary.isEmpty).toBe(false);
    expect(expenseTotalForPeriod(rows, period)).toBe(90);
  });

  it('still excludes a transaction just past the period', () => {
    const summary = buildReviewSummary({
      period,
      transactions: [
        makeTransaction({ id: 'next', date: isoAtLocal(2026, 8, 1, 0, 30), amount: 90 }),
      ],
      categories: [],
      hourlyRate: 0,
    });
    expect(summary.expense).toBe(0);
  });

  it('buckets same-day timestamps together rather than one bar each', () => {
    const summary = buildReviewSummary({
      period,
      transactions: [
        makeTransaction({ id: 'a', date: isoAtLocal(2026, 7, 2, 8), amount: 10 }),
        makeTransaction({ id: 'b', date: isoAtLocal(2026, 7, 2, 19, 45), amount: 20 }),
      ],
      categories: [],
      hourlyRate: 0,
    });
    expect(summary.bars[0].value).toBe(30);
    expect(summary.standouts.busiestDay).toMatchObject({ dayKey: '2026-07-02', count: 2 });
    // 31 days, one of them logged.
    expect(summary.standouts.quietDayCount).toBe(30);
  });

  it('exposes plain day keys downstream, never raw timestamps', () => {
    const summary = buildReviewSummary({
      period,
      transactions: [
        makeTransaction({
          id: 'a',
          date: isoAtLocal(2026, 7, 2, 8),
          amount: 10,
          categoryId: 'food',
        }),
      ],
      categories: [makeCategory('food')],
      hourlyRate: 0,
    });
    expect(summary.standouts.biggestExpense?.dayKey).toBe('2026-07-02');
    expect(summary.categories[0].items[0].dayKey).toBe('2026-07-02');
  });
});

describe('expenseTotalForPeriod', () => {
  it('sums only live expenses inside the period', () => {
    const period = lastCompletedPeriod({
      zoom: 'week',
      today: TODAY,
      weekStartsOn: 1,
      monthCycle: 1,
    });
    const total = expenseTotalForPeriod(
      [
        makeTransaction({ id: 'a', date: '2026-07-27', amount: 10 }),
        makeTransaction({ id: 'b', date: '2026-07-27', type: 'income', amount: 999 }),
        makeTransaction({ id: 'c', date: '2026-07-27', amount: 5, deletedAt: '2026-07-28' }),
        makeTransaction({ id: 'd', date: '2026-08-04', amount: 77 }),
      ],
      period,
    );
    expect(total).toBe(10);
  });
});
