import type { RecurringTransactionRule } from '~/types';
import { filterRecurringRulesByWallet, recurringAmountPerMonth } from '~/utils/recurringRules';

const AVERAGE_DAYS_PER_MONTH = 365.2425 / 12;

function makeRule(overrides: Partial<RecurringTransactionRule>): RecurringTransactionRule {
  return {
    id: overrides.id ?? 'r1',
    name: 'Rent',
    type: 'expense',
    amount: 100,
    currency: 'USD',
    accountId: overrides.accountId ?? null,
    fromAccountId: overrides.fromAccountId ?? null,
    toAccountId: overrides.toAccountId ?? null,
    categoryId: null,
    note: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: '2026-06-01T00:00:00.000Z',
    endDate: null,
    isActive: true,
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
