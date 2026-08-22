import {
  buildBudgetMonthSummary,
  computeBackPopulateRange,
  computeBudgetPagerMonths,
} from '~/features/budget/lib/budgetMath';
/**
 * Regression guard: a user on the default `firstDayOfMonth = 1` must get exactly
 * the legacy calendar-month behaviour across every consumer that now routes
 * through `utils/financialMonth`. Each test compares the day-1 result against the
 * pre-existing calendar-month helpers (or an explicit calendar-month expectation)
 * and against the omitted-parameter default, so the "opt-in only" guarantee can't
 * silently regress.
 */
import { buildCalendarMonthFromGrouped } from '~/features/calendar/lib/calendarBuild';
import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import type { Category, MonthlyBudget, TransactionWithRelations } from '~/types';
import { monthKeyFromIsoLocal } from '~/utils/formatters';
import {
  bucketTransactionsByAccountPeriod,
  statementPeriodKeyForTransactionDate,
} from '~/utils/statementPeriods';
import { bucketTransactionsByMonth } from '~/utils/transactions';

function makeTx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: 't1',
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

function makeBudget(overrides: Partial<MonthlyBudget>): MonthlyBudget {
  return {
    id: 'b1',
    month: '2026-07',
    templateId: 'tpl1',
    templateName: 'Everyday',
    templateEmoji: null,
    totalAmount: 1000,
    countUnbudgeted: true,
    lines: [{ id: 'l1', categoryId: 'food', amount: 600, sortOrder: 0 }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Calendar grid — the largest behavioural change. At day 1 the grid must still
// be a plain 1..daysInMonth calendar month.
// ---------------------------------------------------------------------------
describe('calendar grid — firstDayOfMonth = 1 stays a calendar month', () => {
  const baseInput = {
    locale: 'en-US',
    isTimeMode: false,
    getDisplayValueForTransaction: (tx: TransactionWithRelations) => tx.amount,
    todayDayKey: '2026-07-15',
    weekStartsOn: 1 as const,
    firstDayOfMonth: 1,
  };

  it('spans the 1st through the last calendar day with sequential day numbers', () => {
    const data = buildCalendarMonthFromGrouped({
      ...baseInput,
      monthAnchor: new Date(2026, 6, 1), // July 2026 (31 days)
      transactions: [],
    });

    expect(data.monthKey).toBe('2026-07');
    expect(data.firstDayKey).toBe('2026-07-01');
    expect(data.lastDayKey).toBe('2026-07-31');

    const dayCells = data.cells.filter((cell) => cell.kind === 'day');
    expect(dayCells).toHaveLength(31);
    expect(dayCells.map((cell) => (cell.kind === 'day' ? cell.dayNumber : -1))).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
    // Every day cell stays inside the anchor's own calendar month.
    for (const cell of dayCells) {
      if (cell.kind === 'day') expect(cell.dayKey.startsWith('2026-07-')).toBe(true);
    }
    // Grid always fills whole weeks.
    expect(data.cells.length % 7).toBe(0);
  });

  it('handles February leap length at day 1', () => {
    const leap = buildCalendarMonthFromGrouped({
      ...baseInput,
      monthAnchor: new Date(2024, 1, 1), // Feb 2024 (leap, 29 days)
      transactions: [],
    });
    expect(leap.firstDayKey).toBe('2024-02-01');
    expect(leap.lastDayKey).toBe('2024-02-29');
    expect(leap.cells.filter((cell) => cell.kind === 'day')).toHaveLength(29);
  });

  it('aggregates day totals into the calendar month exactly as before', () => {
    const data = buildCalendarMonthFromGrouped({
      ...baseInput,
      monthAnchor: new Date(2026, 6, 1),
      transactions: [
        makeTx({ id: 'a', type: 'income', amount: 100, reportingAmount: 100, date: '2026-07-01' }),
        makeTx({ id: 'b', type: 'expense', amount: 30, reportingAmount: 30, date: '2026-07-01' }),
        makeTx({ id: 'c', type: 'expense', amount: 20, reportingAmount: 20, date: '2026-07-31' }),
      ],
    });

    expect(data.totalIncome).toBe(100);
    expect(data.totalExpense).toBe(50);
    expect(data.totalNet).toBe(50);
    expect(data.activeDayCount).toBe(2);
    expect(data.dailyByDayKey.get('2026-07-01')?.net).toBe(70);
    expect(data.dailyByDayKey.get('2026-07-31')?.expense).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Transaction bucketing — the shared month-grouping funnel.
// ---------------------------------------------------------------------------
describe('bucketTransactionsByMonth — day 1 matches monthKeyFromIsoLocal', () => {
  const txs = [
    makeTx({ id: 'a', type: 'income', amount: 100, date: '2026-05-01T00:00:00.000Z' }),
    makeTx({ id: 'b', type: 'expense', amount: 30, date: '2026-05-31T23:00:00.000Z' }),
    makeTx({ id: 'c', type: 'income', amount: 50, date: '2026-06-01' }),
  ];
  const resolve = (t: TransactionWithRelations) => t.amount;

  it('keys every transaction by its calendar month', () => {
    const { transactionsMap } = bucketTransactionsByMonth(txs, resolve, 1);
    for (const tx of txs) {
      const key = monthKeyFromIsoLocal(tx.date);
      expect(transactionsMap.get(key)).toContain(tx);
    }
  });

  it('is identical whether the day is passed as 1 or omitted', () => {
    const explicit = bucketTransactionsByMonth(txs, resolve, 1);
    const omitted = bucketTransactionsByMonth(txs, resolve);
    expect(Array.from(explicit.transactionsMap.keys()).sort()).toEqual(
      Array.from(omitted.transactionsMap.keys()).sort(),
    );
    expect(Array.from(explicit.summaries.entries())).toEqual(
      Array.from(omitted.summaries.entries()),
    );
  });
});

// ---------------------------------------------------------------------------
// Budget math.
// ---------------------------------------------------------------------------
describe('budget math — day 1 matches calendar-month behaviour', () => {
  const categories = [makeCategory('food'), makeCategory('transport')];

  it('buildBudgetMonthSummary is identical at day 1 vs omitted, calendar-bucketed', () => {
    const transactions = [
      makeTx({ id: 'a', categoryId: 'food', amount: 100, date: '2026-07-01' }),
      makeTx({ id: 'b', categoryId: 'food', amount: 50, date: '2026-07-31' }),
      // Adjacent months must NOT count toward July at day 1.
      makeTx({ id: 'c', categoryId: 'food', amount: 999, date: '2026-06-30' }),
      makeTx({ id: 'd', categoryId: 'food', amount: 999, date: '2026-08-01' }),
    ];
    const budget = makeBudget({});
    const withDay1 = buildBudgetMonthSummary({
      month: '2026-07',
      budget,
      transactions,
      categories,
      firstDayOfMonth: 1,
    });
    const omitted = buildBudgetMonthSummary({ month: '2026-07', budget, transactions, categories });

    expect(withDay1?.totalSpent).toBe(150);
    expect(withDay1).toEqual(omitted);
  });

  it('computeBudgetPagerMonths is identical at day 1 vs omitted', () => {
    const now = new Date(2026, 6, 15);
    const budgets = [makeBudget({ month: '2026-05' })];
    const transactions = [makeTx({ date: '2026-04-10T12:00:00.000Z' })];
    const withDay1 = computeBudgetPagerMonths({ budgets, transactions, now, firstDayOfMonth: 1 });
    const omitted = computeBudgetPagerMonths({ budgets, transactions, now });
    expect(withDay1).toEqual(omitted);
    expect(withDay1[0]).toBe('2026-04');
    expect(withDay1).toContain('2026-07');
  });

  it('computeBackPopulateRange is identical at day 1 vs omitted', () => {
    const now = new Date(2026, 6, 15);
    const transactions = [
      makeTx({ id: 'a', type: 'expense', date: '2026-04-10T12:00:00.000Z' }),
      makeTx({ id: 'b', type: 'expense', date: '2026-05-20T12:00:00.000Z' }),
    ];
    const withDay1 = computeBackPopulateRange({
      transactions,
      existingMonths: [],
      now,
      firstDayOfMonth: 1,
    });
    const omitted = computeBackPopulateRange({ transactions, existingMonths: [], now });
    expect(withDay1).toEqual(omitted);
    expect(withDay1?.firstMonthKey).toBe('2026-04');
  });
});

// ---------------------------------------------------------------------------
// Statement periods — the debit fallback now takes firstDayOfMonth, and the
// credit statement-cycle path must ignore it entirely.
// ---------------------------------------------------------------------------
describe('bucketTransactionsByAccountPeriod — day 1 keeps existing behaviour', () => {
  const txs = [
    makeTx({ id: 'a', date: '2026-05-31T00:00:00.000Z' }),
    makeTx({ id: 'b', date: '2026-06-01T00:00:00.000Z' }),
  ];

  it('debit (no statement day) at day 1 keys by calendar month, same as omitted', () => {
    const withDay1 = bucketTransactionsByAccountPeriod(txs, null, 1);
    const omitted = bucketTransactionsByAccountPeriod(txs, null);
    for (const tx of txs) {
      const key = monthKeyFromIsoLocal(tx.date);
      expect(withDay1.get(key)).toContain(tx);
    }
    expect(Array.from(withDay1.keys()).sort()).toEqual(Array.from(omitted.keys()).sort());
  });

  it('credit statement cycles ignore firstDayOfMonth', () => {
    const withDay1 = bucketTransactionsByAccountPeriod(txs, 15, 1);
    const withDay25 = bucketTransactionsByAccountPeriod(txs, 15, 25);
    // Same statement day => identical buckets regardless of the financial-month setting.
    expect(Array.from(withDay1.keys()).sort()).toEqual(Array.from(withDay25.keys()).sort());
    for (const tx of txs) {
      const key = statementPeriodKeyForTransactionDate(tx.date, 15);
      expect(withDay1.get(key)).toContain(tx);
    }
  });
});
