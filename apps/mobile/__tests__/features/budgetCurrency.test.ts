import {
  budgetCurrencyOf,
  budgetRate,
  budgetRateToFreeze,
  budgetSpendValue,
  budgetTotalInMainCurrency,
  storedBudgetCurrency,
  withBudgetCurrency,
} from '~/features/budget/lib/budgetCurrency';
import { buildBudgetSummary } from '~/features/budget/lib/budgetMath';
import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import type { Category, PeriodBudget, RateTable, TransactionWithRelations } from '~/types';

// A MYR ledger: 1 MYR = 33 JPY, 1 MYR = 0.3 SGD.
const table: RateTable = { base: 'MYR', rates: { MYR: 1, JPY: 33, SGD: 0.3 }, asOfDate: null };

function expense(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: 't1',
    type: 'expense',
    amount: 10,
    currency: 'MYR',
    reportingCurrency: 'MYR',
    reportingAmount: 10,
    fxRate: 1,
    date: '2026-07-10T12:00:00.000Z',
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'food',
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

function budget(overrides: Partial<PeriodBudget>): PeriodBudget {
  return {
    id: 'b1',
    period: 'month',
    periodKey: '2026-07',
    templateId: null,
    templateName: 'Japan trip',
    templateEmoji: null,
    totalAmount: 100000,
    countUnbudgeted: true,
    currency: 'JPY',
    fxRate: 0.03,
    lines: [{ id: 'l1', categoryId: 'food', amount: 60000, sortOrder: 0 }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const categories: Pick<Category, 'id' | 'parentId'>[] = [
  { id: 'food', parentId: null },
  { id: 'fun', parentId: null },
];

describe('budget currency helpers', () => {
  it('stores the main currency as null and any other as its code', () => {
    expect(storedBudgetCurrency('MYR', 'MYR')).toBeNull();
    expect(storedBudgetCurrency(null, 'MYR')).toBeNull();
    expect(storedBudgetCurrency(undefined, 'MYR')).toBeNull();
    expect(storedBudgetCurrency('JPY', 'MYR')).toBe('JPY');
    expect(budgetCurrencyOf({ currency: null }, 'MYR')).toBe('MYR');
    expect(budgetCurrencyOf({ currency: 'JPY' }, 'MYR')).toBe('JPY');
  });

  it('freezes 1 unit of the budget currency in the main currency', () => {
    expect(budgetRateToFreeze('JPY', table)).toBeCloseTo(1 / 33);
    expect(budgetRateToFreeze('SGD', table)).toBeCloseTo(1 / 0.3);
    expect(budgetRateToFreeze(null, table)).toBeNull();
    expect(budgetRateToFreeze('MYR', table)).toBeNull();
    expect(budgetRateToFreeze('EUR', table)).toBeNull();
  });

  it('prefers the frozen rate, then the latest one', () => {
    expect(budgetRate({ currency: null, fxRate: null }, table)).toBe(1);
    expect(budgetRate({ currency: 'JPY', fxRate: 0.03 }, table)).toBe(0.03);
    expect(budgetRate({ currency: 'JPY', fxRate: null }, table)).toBeCloseTo(1 / 33);
    expect(budgetRate({ currency: 'EUR', fxRate: null }, table)).toBeNull();
    expect(budgetRate({ currency: 'JPY', fxRate: null }, null)).toBeNull();
    // A row naming the main currency's code is still a main-currency budget.
    expect(budgetRate({ currency: 'MYR', fxRate: null }, table)).toBe(1);
  });

  it('values spending in the budget currency at face value and converts the rest', () => {
    const yen = expense({ currency: 'JPY', amount: 3300, reportingAmount: 99 });
    const ringgit = expense({ amount: 30, reportingAmount: 30 });
    expect(budgetSpendValue(yen, 'JPY', 0.03)).toBe(3300);
    expect(budgetSpendValue(ringgit, 'JPY', 0.03)).toBeCloseTo(1000);
    expect(budgetSpendValue(ringgit, 'JPY', null)).toBeNull();
    // A main-currency budget reads the frozen reporting amount, as before.
    expect(budgetSpendValue(yen, null, null)).toBe(99);
  });

  it('states a budget total in the main currency', () => {
    expect(budgetTotalInMainCurrency(budget({}), table)).toBeCloseTo(3000);
    expect(budgetTotalInMainCurrency(budget({ currency: null, fxRate: null }), table)).toBe(100000);
    expect(budgetTotalInMainCurrency(budget({ currency: 'EUR', fxRate: null }), table)).toBeNull();
  });

  it('swaps the currency into the settings the formatters read', () => {
    const settings = { currencyCode: 'MYR', currencySymbol: 'RM', locale: 'en' };
    expect(withBudgetCurrency(settings, null)).toBe(settings);
    expect(withBudgetCurrency(settings, 'MYR')).toBe(settings);
    expect(withBudgetCurrency(settings, 'JPY')).toMatchObject({
      currencyCode: 'JPY',
      currencySymbol: '¥',
      locale: 'en',
    });
  });
});

describe('buildBudgetSummary in another currency', () => {
  it('counts own-currency spending exactly and converts the rest at the frozen rate', () => {
    const summary = buildBudgetSummary({
      budget: budget({}),
      transactions: [
        expense({ id: 'a', currency: 'JPY', amount: 3300, reportingAmount: 99 }),
        // RM30 at the frozen 0.03 = ¥1,000 (not the latest 1/33, which would be ¥990).
        expense({ id: 'b', amount: 30, reportingAmount: 30 }),
        expense({ id: 'c', categoryId: 'fun', amount: 6, reportingAmount: 6 }),
      ],
      categories,
      rateTable: table,
    });
    expect(summary?.categories[0]).toMatchObject({ budgeted: 60000, spent: 4300 });
    expect(summary?.unbudgetedSpent).toBe(200);
    expect(summary?.totalSpent).toBe(4500);
    expect(summary?.remaining).toBe(95500);
    expect(summary?.unconvertedCount).toBe(0);
  });

  it('falls back to the latest rate when none was frozen', () => {
    const summary = buildBudgetSummary({
      budget: budget({ fxRate: null }),
      transactions: [expense({ amount: 30, reportingAmount: 30 })],
      categories,
      rateTable: table,
    });
    expect(summary?.totalSpent).toBe(990);
  });

  it('leaves out and counts spending it cannot convert', () => {
    const summary = buildBudgetSummary({
      budget: budget({ currency: 'EUR', fxRate: null, totalAmount: 500 }),
      transactions: [
        expense({ id: 'a', currency: 'EUR', amount: 20, reportingAmount: 100 }),
        expense({ id: 'b', amount: 30, reportingAmount: 30 }),
        expense({ id: 'c', amount: 5, reportingAmount: 5 }),
      ],
      categories,
      rateTable: table,
    });
    expect(summary?.totalSpent).toBe(20);
    expect(summary?.unconvertedCount).toBe(2);
  });

  it('mentions only uncounted spending that would count toward the budget', () => {
    const summary = buildBudgetSummary({
      budget: budget({ currency: 'EUR', fxRate: null, totalAmount: 500, countUnbudgeted: false }),
      transactions: [
        expense({ id: 'a', amount: 30, reportingAmount: 30 }),
        // Outside the budget's lines, which do not count here anyway.
        expense({ id: 'b', categoryId: 'fun', amount: 5, reportingAmount: 5 }),
      ],
      categories,
      rateTable: table,
    });
    expect(summary?.unconvertedCount).toBe(1);
  });

  it('keeps a main-currency budget exactly as it was', () => {
    const summary = buildBudgetSummary({
      budget: budget({ currency: null, fxRate: null, totalAmount: 1000 }),
      transactions: [
        expense({ id: 'a', currency: 'JPY', amount: 3300, reportingAmount: 99 }),
        expense({ id: 'b', amount: 30, reportingAmount: 30 }),
      ],
      categories,
    });
    expect(summary?.totalSpent).toBe(129);
    expect(summary?.unconvertedCount).toBe(0);
  });
});
