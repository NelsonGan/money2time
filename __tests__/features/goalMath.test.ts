import {
  computeGoalProgress,
  isGoalAchieved,
  monthlyEquivalentRate,
} from '~/features/goals/lib/goalMath';
import type { RecurringTransactionRule } from '~/types';

const BASE = {
  balance: 0,
  startingBalance: 0,
  target: 1000,
  createdAt: '2026-01-01T00:00:00.000Z',
  targetDate: null as string | null,
  achievedAt: null as string | null,
  monthlyRate: null as number | null,
  todayIso: '2026-07-01',
};

function rule(overrides: Partial<RecurringTransactionRule>): RecurringTransactionRule {
  return {
    id: 'r1',
    name: 'Auto-save',
    type: 'transfer',
    amount: 100,
    currency: 'USD',
    toAmount: null,
    accountId: null,
    fromAccountId: 'src',
    toAccountId: 'goal-1',
    categoryId: null,
    note: null,
    logoId: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: '2026-08-01',
    endDate: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('computeGoalProgress ratio', () => {
  it('is saved / target', () => {
    expect(computeGoalProgress({ ...BASE, balance: 250 }).ratio).toBe(0.25);
  });

  it('clamps negative balances to 0 but reports the real saved amount', () => {
    const p = computeGoalProgress({ ...BASE, balance: -50 });
    expect(p.ratio).toBe(0);
    expect(p.saved).toBe(-50);
  });

  it('exceeds 1 when over-saved', () => {
    expect(computeGoalProgress({ ...BASE, balance: 1050 }).ratio).toBeCloseTo(1.05);
  });
});

describe('achievement', () => {
  it('achieved when balance reaches target', () => {
    expect(isGoalAchieved({ balance: 1000, target: 1000, achievedAt: null })).toBe(true);
  });

  it('does not treat a non-positive target as trivially achieved', () => {
    expect(isGoalAchieved({ balance: 0, target: 0, achievedAt: null })).toBe(false);
    expect(isGoalAchieved({ balance: 100, target: -5, achievedAt: null })).toBe(false);
  });

  it('stays achieved via the stamp even after spending down', () => {
    expect(isGoalAchieved({ balance: 10, target: 1000, achievedAt: '2026-06-01' })).toBe(true);
    expect(computeGoalProgress({ ...BASE, balance: 10, achievedAt: '2026-06-01' }).pace).toBe(
      'achieved',
    );
  });
});

describe('pace', () => {
  it('is null with no target date and no achievement', () => {
    expect(computeGoalProgress({ ...BASE, balance: 100 }).pace).toBeNull();
  });

  it('scores against a starting-balance adjusted expected line', () => {
    // Created 2026-01-01 with 500 already saved, target 1000 by 2027-01-01.
    // Half way through the year the expected line is 500 + 500 * ~0.5 ≈ 750.
    const partFunded = {
      ...BASE,
      startingBalance: 500,
      targetDate: '2027-01-01',
      todayIso: '2026-07-02',
    };
    expect(computeGoalProgress({ ...partFunded, balance: 760 }).pace).toBe('onTrack');
    // Without the adjustment 600 (60%) would look ahead of 50% elapsed time.
    expect(computeGoalProgress({ ...partFunded, balance: 600 }).pace).toBe('behind');
  });

  it('is behind once the target date has passed without achievement', () => {
    expect(computeGoalProgress({ ...BASE, balance: 999, targetDate: '2026-06-01' }).pace).toBe(
      'behind',
    );
  });
});

describe('projection', () => {
  it('projects completion from the monthly rate', () => {
    const p = computeGoalProgress({ ...BASE, balance: 400, monthlyRate: 100 });
    // 600 remaining at 100/month ≈ 6 months out from 2026-07-01.
    expect(p.projectedDate).toBe('2026-12-31');
  });

  it('is null when achieved or without a positive rate', () => {
    expect(
      computeGoalProgress({ ...BASE, balance: 1000, monthlyRate: 100 }).projectedDate,
    ).toBeNull();
    expect(computeGoalProgress({ ...BASE, balance: 400 }).projectedDate).toBeNull();
    expect(computeGoalProgress({ ...BASE, balance: 400, monthlyRate: 0 }).projectedDate).toBeNull();
  });
});

describe('requiredMonthly', () => {
  it('divides the remainder over the months left', () => {
    const p = computeGoalProgress({
      ...BASE,
      balance: 400,
      targetDate: '2026-12-30',
      todayIso: '2026-07-01',
    });
    // 600 remaining over ~6 months ≈ 100/month.
    expect(p.requiredMonthly).toBeGreaterThan(90);
    expect(p.requiredMonthly).toBeLessThan(110);
  });

  it('is the full remainder when the date has passed', () => {
    const p = computeGoalProgress({
      ...BASE,
      balance: 400,
      targetDate: '2026-06-01',
      todayIso: '2026-07-01',
    });
    expect(p.requiredMonthly).toBe(600);
  });

  it('is null when achieved or without a date', () => {
    expect(computeGoalProgress({ ...BASE, balance: 400 }).requiredMonthly).toBeNull();
    expect(
      computeGoalProgress({ ...BASE, balance: 1000, targetDate: '2026-12-01' }).requiredMonthly,
    ).toBeNull();
  });
});

describe('monthlyEquivalentRate', () => {
  it('sums active transfer rules targeting the goal, per pattern', () => {
    const rules = [
      rule({ id: 'a', amount: 100, recurrencePattern: 'monthly' }),
      rule({ id: 'b', amount: 70, recurrencePattern: 'weekly' }),
    ];
    // 100 + 70 * (30.44 / 7) ≈ 404.4
    expect(monthlyEquivalentRate(rules, 'goal-1')).toBeCloseTo(404.4, 0);
  });

  it('respects intervals and yearly/daily patterns', () => {
    expect(
      monthlyEquivalentRate(
        [rule({ recurrencePattern: 'monthly', recurrenceInterval: 2 })],
        'goal-1',
      ),
    ).toBe(50);
    expect(
      monthlyEquivalentRate([rule({ amount: 1200, recurrencePattern: 'yearly' })], 'goal-1'),
    ).toBe(100);
    expect(
      monthlyEquivalentRate([rule({ amount: 10, recurrencePattern: 'daily' })], 'goal-1'),
    ).toBeCloseTo(304.4, 1);
  });

  it('prefers the cross-currency toAmount over amount', () => {
    expect(monthlyEquivalentRate([rule({ amount: 25, toAmount: 110 })], 'goal-1')).toBe(110);
  });

  it('ignores inactive rules, other targets, and non-transfers', () => {
    expect(monthlyEquivalentRate([rule({ isActive: false })], 'goal-1')).toBeNull();
    expect(monthlyEquivalentRate([rule({ toAccountId: 'other' })], 'goal-1')).toBeNull();
    expect(monthlyEquivalentRate([rule({ type: 'expense' })], 'goal-1')).toBeNull();
  });
});
