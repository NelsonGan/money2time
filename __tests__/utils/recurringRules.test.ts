import type { RecurringTransactionRule } from '~/types';
import {
  addDaysToDayKey,
  filterRecurringRulesByWallet,
  nextRunAfter,
  projectRecurringOccurrences,
  recurringAmountPerMonth,
  recurringMonthlyExpenseTotal,
} from '~/utils/recurringRules';

const AVERAGE_DAYS_PER_MONTH = 365.2425 / 12;

function makeRule(overrides: Partial<RecurringTransactionRule>): RecurringTransactionRule {
  return {
    id: overrides.id ?? 'r1',
    name: 'Rent',
    type: 'expense',
    amount: 100,
    currency: 'USD',
    toAmount: null,
    accountId: overrides.accountId ?? null,
    fromAccountId: overrides.fromAccountId ?? null,
    toAccountId: overrides.toAccountId ?? null,
    categoryId: null,
    note: null,
    logoId: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: '2026-06-01T00:00:00.000Z',
    endDate: null,
    isActive: true,
    countsAsExpense: false,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('recurringAmountPerMonth', () => {
  it('returns the amount unchanged for monthly with interval 1', () => {
    expect(recurringAmountPerMonth(100, 'monthly', 1)).toBe(100);
  });

  it('halves the per-month amount for monthly with interval 2', () => {
    expect(recurringAmountPerMonth(100, 'monthly', 2)).toBe(50);
  });

  it('multiplies daily amounts by the average days per month', () => {
    expect(recurringAmountPerMonth(1, 'daily', 1)).toBeCloseTo(AVERAGE_DAYS_PER_MONTH, 5);
  });

  it('weekly amounts approximate ~4.35 weeks per month', () => {
    expect(recurringAmountPerMonth(100, 'weekly', 1)).toBeCloseTo(
      (100 * AVERAGE_DAYS_PER_MONTH) / 7,
      5,
    );
  });

  it('yearly amounts divide by 12', () => {
    expect(recurringAmountPerMonth(1200, 'yearly', 1)).toBeCloseTo(100, 5);
  });

  it('treats zero/negative intervals as 1', () => {
    expect(recurringAmountPerMonth(100, 'monthly', 0)).toBe(100);
    expect(recurringAmountPerMonth(100, 'monthly', -5)).toBe(100);
  });
});

describe('filterRecurringRulesByWallet', () => {
  const r1 = makeRule({ id: 'r1', accountId: 'w1' });
  const r2 = makeRule({ id: 'r2', fromAccountId: 'w1' });
  const r3 = makeRule({ id: 'r3', toAccountId: 'w1' });
  const r4 = makeRule({ id: 'r4', accountId: 'w2' });
  const rules = [r1, r2, r3, r4];

  it('returns all rules when walletId is falsy', () => {
    expect(filterRecurringRulesByWallet(rules, null)).toBe(rules);
    expect(filterRecurringRulesByWallet(rules, undefined)).toBe(rules);
  });

  it('matches rules across accountId, fromAccountId, and toAccountId', () => {
    expect(filterRecurringRulesByWallet(rules, 'w1')).toEqual([r1, r2, r3]);
  });

  it('returns an empty list when there is no match', () => {
    expect(filterRecurringRulesByWallet(rules, 'missing')).toEqual([]);
  });
});

describe('recurringMonthlyExpenseTotal', () => {
  // 1 MYR = 0.3153 SGD, everything else already reporting-currency.
  const toSgd = (amount: number, currency: string) =>
    currency === 'MYR' ? amount * 0.3153 : amount;

  it('converts foreign-currency rules instead of counting them at face value', () => {
    const rules = [makeRule({ id: 'car', amount: 966.9, currency: 'MYR' })];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBeCloseTo(304.86, 2);
  });

  it('sums mixed currencies in the reporting currency', () => {
    const rules = [
      makeRule({ id: 'car', amount: 966.9, currency: 'MYR' }),
      makeRule({ id: 'rent', amount: 1000, currency: 'SGD' }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBeCloseTo(1304.86, 2);
  });

  it('normalises cadence after converting', () => {
    const rules = [
      makeRule({ id: 'insurance', amount: 1200, currency: 'MYR', recurrencePattern: 'yearly' }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBeCloseTo((1200 * 0.3153) / 12, 5);
  });

  it('ignores paused rules and non-expense types', () => {
    const rules = [
      makeRule({ id: 'paused', amount: 500, currency: 'MYR', isActive: false }),
      makeRule({ id: 'salary', amount: 5000, currency: 'MYR', type: 'income' }),
      makeRule({ id: 'move', amount: 200, currency: 'MYR', type: 'transfer' }),
      makeRule({ id: 'rent', amount: 1000, currency: 'SGD' }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBe(1000);
  });

  // A loan's auto-repayment rule is a transfer, so the borrower's monthly
  // commitment was missing the biggest line on it while every other spending
  // readout counted the repayments it generates.
  it('counts a loan repayment rule the borrower asked to be counted as spending', () => {
    const rules = [
      makeRule({ id: 'rent', amount: 1000, currency: 'SGD' }),
      makeRule({
        id: 'car',
        name: 'Car loan repayment',
        type: 'transfer',
        amount: 2232,
        currency: 'SGD',
        fromAccountId: 'bank',
        toAccountId: 'loan',
        countsAsExpense: true,
      }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBe(3232);
  });

  it('leaves an uncounted loan repayment out, as an ordinary transfer', () => {
    const rules = [
      makeRule({
        id: 'car',
        type: 'transfer',
        amount: 2232,
        currency: 'SGD',
        fromAccountId: 'bank',
        toAccountId: 'loan',
        countsAsExpense: false,
      }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBe(0);
  });

  it('converts and normalises a counted repayment like any other rule', () => {
    const rules = [
      makeRule({
        id: 'car',
        type: 'transfer',
        amount: 966.9,
        currency: 'MYR',
        recurrencePattern: 'yearly',
        countsAsExpense: true,
      }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBeCloseTo((966.9 * 0.3153) / 12, 5);
  });

  it('still skips a counted repayment once its rule is paused', () => {
    const rules = [
      makeRule({
        id: 'car',
        type: 'transfer',
        amount: 2232,
        currency: 'SGD',
        countsAsExpense: true,
        isActive: false,
      }),
    ];
    expect(recurringMonthlyExpenseTotal(rules, toSgd)).toBe(0);
  });

  it('is zero when there are no rules', () => {
    expect(recurringMonthlyExpenseTotal([], toSgd)).toBe(0);
  });
});

describe('nextRunAfter', () => {
  it('advances by whole days, weeks, months and years', () => {
    expect(nextRunAfter('2026-01-10T00:00:00.000Z', 'daily', 3)).toBe('2026-01-13T00:00:00.000Z');
    expect(nextRunAfter('2026-01-10T00:00:00.000Z', 'weekly', 2)).toBe('2026-01-24T00:00:00.000Z');
    expect(nextRunAfter('2026-01-10T00:00:00.000Z', 'monthly', 1)).toBe('2026-02-10T00:00:00.000Z');
    expect(nextRunAfter('2026-01-10T00:00:00.000Z', 'yearly', 1)).toBe('2027-01-10T00:00:00.000Z');
  });

  it('clamps a month-end run date into a shorter month instead of overflowing', () => {
    expect(nextRunAfter('2026-01-31T00:00:00.000Z', 'monthly', 1)).toBe('2026-02-28T00:00:00.000Z');
  });

  it('returns null for a pattern that does not repeat or an unparseable date', () => {
    expect(nextRunAfter('2026-01-10T00:00:00.000Z', 'none', 1)).toBeNull();
    expect(nextRunAfter('not-a-date', 'monthly', 1)).toBeNull();
  });
});

describe('addDaysToDayKey', () => {
  it('crosses month and year boundaries', () => {
    expect(addDaysToDayKey('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('projectRecurringOccurrences', () => {
  // Local-noon run dates so the projected day keys do not depend on the
  // machine's timezone offset.
  const at = (dayKey: string) => new Date(`${dayKey}T12:00:00`).toISOString();

  it('emits one occurrence per period inside the window', () => {
    const rule = makeRule({ recurrencePattern: 'weekly', nextRunDate: at('2026-06-01') });
    const occurrences = projectRecurringOccurrences([rule], {
      fromDayKey: '2026-06-01',
      days: 21,
    });
    expect(occurrences.map((o) => o.dayKey)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
  });

  it('excludes the day after the window closes', () => {
    const rule = makeRule({ recurrencePattern: 'daily', nextRunDate: at('2026-06-01') });
    const occurrences = projectRecurringOccurrences([rule], { fromDayKey: '2026-06-01', days: 3 });
    expect(occurrences.map((o) => o.dayKey)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('skips paused rules', () => {
    const rule = makeRule({ isActive: false, nextRunDate: at('2026-06-01') });
    expect(projectRecurringOccurrences([rule], { fromDayKey: '2026-06-01', days: 30 })).toEqual([]);
  });

  it('stops at the rule end date', () => {
    const rule = makeRule({
      recurrencePattern: 'weekly',
      nextRunDate: at('2026-06-01'),
      endDate: at('2026-06-10'),
    });
    const occurrences = projectRecurringOccurrences([rule], {
      fromDayKey: '2026-06-01',
      days: 30,
    });
    expect(occurrences.map((o) => o.dayKey)).toEqual(['2026-06-01', '2026-06-08']);
  });

  it('buckets an overdue run under the first day of the window and flags it', () => {
    const rule = makeRule({ recurrencePattern: 'monthly', nextRunDate: at('2026-05-28') });
    const occurrences = projectRecurringOccurrences([rule], {
      fromDayKey: '2026-06-01',
      days: 40,
    });
    expect(occurrences.map((o) => [o.dayKey, o.overdue])).toEqual([
      ['2026-06-01', true],
      ['2026-06-28', false],
    ]);
  });

  it('collapses a whole missed run into one overdue occurrence', () => {
    // Thirty days of a daily rule the app has not seen. The runner will write
    // those dated in the past, so only one is "still to come" in this window.
    const rule = makeRule({ recurrencePattern: 'daily', nextRunDate: at('2026-05-02') });
    const occurrences = projectRecurringOccurrences([rule], {
      fromDayKey: '2026-06-01',
      days: 3,
    });
    expect(occurrences.map((o) => [o.dayKey, o.overdue])).toEqual([
      ['2026-06-01', true],
      ['2026-06-01', false],
      ['2026-06-02', false],
      ['2026-06-03', false],
    ]);
  });

  it('orders occurrences from several rules by day', () => {
    const rules = [
      makeRule({ id: 'later', nextRunDate: at('2026-06-20') }),
      makeRule({ id: 'sooner', nextRunDate: at('2026-06-03') }),
    ];
    const occurrences = projectRecurringOccurrences(rules, {
      fromDayKey: '2026-06-01',
      days: 30,
    });
    expect(occurrences.map((o) => o.rule.id)).toEqual(['sooner', 'later']);
  });
});
