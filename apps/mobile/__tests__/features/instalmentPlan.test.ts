import {
  buildInstalmentPlans,
  buildInstalmentProgress,
  canConvertToInstalmentPlan,
  clampInstalmentCount,
  frequencyOfSchedule,
  INSTALMENT_PAYOFF_NUMBER,
  instalmentAmounts,
  instalmentDueBetween,
  instalmentPaymentCandidates,
  type InstalmentPaymentRow,
  instalmentPaymentsKey,
  instalmentScheduleDates,
  isInstalmentPlan,
  isRegularAmountValid,
  paymentRowsForPlan,
  paymentsAlreadyDue,
  regularAmountImpliesOtherTotal,
  scheduleOfFrequency,
  splitInstalmentAmounts,
} from '~/features/instalments/lib/instalmentPlan';
import type { RecurringTransactionRule } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

/** Local noon on a day: the same calendar day in UTC in every time zone. */
function noon(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12).toISOString();
}

function makePlan(
  overrides: Partial<RecurringTransactionRule> = {},
): RecurringTransactionRule & { instalmentCount: number } {
  return {
    id: 'plan1',
    name: 'iPhone 17 Pro',
    type: 'expense',
    amount: 200,
    currency: 'MYR',
    toAmount: null,
    accountId: 'card',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'shopping',
    note: 'iPhone 17 Pro',
    logoId: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: noon('2026-12-02'),
    anchorDay: null,
    endDate: noon('2027-10-02'),
    isActive: true,
    countsAsExpense: false,
    memberId: null,
    instalmentTotal: 2400,
    instalmentStartDate: noon('2026-11-02'),
    createdAt: noon('2026-11-02'),
    updatedAt: noon('2026-11-02'),
    deletedAt: null,
    ...overrides,
    instalmentCount: overrides.instalmentCount ?? 12,
  };
}

function payment(
  number: number,
  date: string,
  amount = 200,
  overrides: Partial<InstalmentPaymentRow> = {},
): InstalmentPaymentRow {
  return {
    id: `p${number}`,
    amount,
    date,
    instalmentNumber: number,
    deletedAt: null,
    ...overrides,
  };
}

describe('splitInstalmentAmounts', () => {
  it('splits an even total into equal payments', () => {
    expect(splitInstalmentAmounts(2400, 12)).toEqual(Array(12).fill(200));
  });

  it('gives the leftover cents to the last payment', () => {
    expect(splitInstalmentAmounts(1000, 3)).toEqual([333.33, 333.33, 333.34]);
    expect(splitInstalmentAmounts(1299, 3)).toEqual([433, 433, 433]);
    expect(splitInstalmentAmounts(100, 7)).toEqual([
      14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.32,
    ]);
  });

  it('always adds back up to the total', () => {
    for (const [total, count] of [
      [2399.99, 12],
      [0.05, 3],
      [12345.67, 36],
      [1, 120],
    ] as const) {
      const sum = splitInstalmentAmounts(total, count).reduce((acc, value) => acc + value, 0);
      expect(Math.round(sum * 100)).toBe(Math.round(total * 100));
    }
  });

  it('survives float noise in the total', () => {
    expect(splitInstalmentAmounts(0.1 + 0.2, 3)).toEqual([0.1, 0.1, 0.1]);
  });

  it('treats a bad count as a single payment', () => {
    expect(splitInstalmentAmounts(50, 0)).toEqual([50]);
    expect(splitInstalmentAmounts(50, Number.NaN)).toEqual([50]);
  });
});

describe('instalmentScheduleDates', () => {
  it('walks monthly from the first payment', () => {
    const dates = instalmentScheduleDates(noon('2026-11-02'), 'monthly', 1, 3);
    expect(dates).toEqual([noon('2026-11-02'), noon('2026-12-02'), noon('2027-01-02')]);
  });

  it('clamps the 31st to short months and returns to it', () => {
    const dates = instalmentScheduleDates(noon('2027-01-31'), 'monthly', 1, 3);
    expect(dates.map((date) => dayKeyFromIsoLocal(date))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('walks every two weeks', () => {
    const dates = instalmentScheduleDates(noon('2026-11-02'), 'weekly', 2, 3);
    expect(dates.map((date) => dayKeyFromIsoLocal(date))).toEqual([
      '2026-11-02',
      '2026-11-16',
      '2026-11-30',
    ]);
  });
});

describe('frequency mapping', () => {
  it('round-trips every offered frequency', () => {
    for (const frequency of ['monthly', 'biweekly', 'weekly'] as const) {
      const { pattern, interval } = scheduleOfFrequency(frequency);
      expect(frequencyOfSchedule(pattern, interval)).toBe(frequency);
    }
  });
});

describe('clampInstalmentCount', () => {
  it('keeps the count between 2 and 120', () => {
    expect(clampInstalmentCount(1)).toBe(2);
    expect(clampInstalmentCount(12.7)).toBe(12);
    expect(clampInstalmentCount(500)).toBe(120);
    expect(clampInstalmentCount(Number.NaN)).toBe(2);
  });
});

describe('isInstalmentPlan', () => {
  it('tells a plan from an ordinary rule', () => {
    expect(isInstalmentPlan(makePlan())).toBe(true);
    expect(isInstalmentPlan({ instalmentCount: null })).toBe(false);
  });
});

describe('canConvertToInstalmentPlan', () => {
  const expense = {
    type: 'expense' as const,
    instalmentRuleId: null,
    feeOfId: null,
    reimbursedAt: null,
    reimbursementTransactionId: null,
    splits: [],
  };

  it('allows a plain expense of the user’s own', () => {
    expect(canConvertToInstalmentPlan(expense)).toBe(true);
    // A pending reimbursement stays on payment 1, as on a new plan.
    expect(canConvertToInstalmentPlan({ ...expense, splits: undefined })).toBe(true);
  });

  it('refuses rows that would still count towards something else', () => {
    expect(canConvertToInstalmentPlan({ ...expense, type: 'income' })).toBe(false);
    expect(canConvertToInstalmentPlan({ ...expense, type: 'transfer' })).toBe(false);
    expect(canConvertToInstalmentPlan({ ...expense, instalmentRuleId: 'plan' })).toBe(false);
    expect(canConvertToInstalmentPlan({ ...expense, feeOfId: 'transfer' })).toBe(false);
    expect(canConvertToInstalmentPlan({ ...expense, reimbursedAt: '2026-11-02' })).toBe(false);
    expect(canConvertToInstalmentPlan({ ...expense, reimbursementTransactionId: 'refund' })).toBe(
      false,
    );
    expect(canConvertToInstalmentPlan({ ...expense, splits: [{}] })).toBe(false);
  });
});

describe('paymentsAlreadyDue', () => {
  const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
  const dates = instalmentScheduleDates(at('2026-08-11'), 'monthly', 1, 6);

  it('counts the payments after the first that fall on or before today', () => {
    expect(paymentsAlreadyDue(dates, new Date(at('2026-11-11')))).toBe(3);
    expect(paymentsAlreadyDue(dates, new Date(at('2026-11-10')))).toBe(2);
  });

  it('is zero for a plan that starts today or later', () => {
    expect(paymentsAlreadyDue(dates, new Date(at('2026-08-11')))).toBe(0);
    expect(paymentsAlreadyDue(dates, new Date(at('2026-01-01')))).toBe(0);
  });
});

describe('buildInstalmentProgress', () => {
  it('reads paid and upcoming payments', () => {
    const plan = makePlan({ nextRunDate: noon('2027-02-02') });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02')),
      payment(2, noon('2026-12-02')),
      payment(3, noon('2027-01-02')),
    ]);
    expect(progress.paidCount).toBe(3);
    expect(progress.paidAmount).toBe(600);
    expect(progress.leftAmount).toBe(1800);
    expect(progress.next?.number).toBe(4);
    expect(progress.next?.dateIso).toBe(noon('2027-02-02'));
    expect(progress.complete).toBe(false);
    expect(progress.paidOff).toBe(false);
    expect(progress.entries.map((entry) => entry.status).slice(0, 5)).toEqual([
      'paid',
      'paid',
      'paid',
      'upcoming',
      'upcoming',
    ]);
  });

  it('marks a payment the runner moved past without a row as skipped', () => {
    const plan = makePlan({ nextRunDate: noon('2027-01-02') });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02')),
      payment(2, noon('2026-12-02'), 200, { deletedAt: '2026-12-03T00:00:00.000Z' }),
    ]);
    expect(progress.entries[1]?.status).toBe('skipped');
    expect(progress.paidCount).toBe(1);
    expect(progress.leftAmount).toBe(2000);
  });

  it('reads a payment made early by its number, not its date', () => {
    const plan = makePlan({ nextRunDate: noon('2027-01-02') });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02')),
      payment(2, '2026-11-20T09:00:00.000Z'),
    ]);
    expect(progress.entries[1]).toMatchObject({
      status: 'paid',
      paidDateIso: '2026-11-20T09:00:00.000Z',
    });
    expect(progress.next?.number).toBe(3);
  });

  it('counts a payoff as the rest of the plan', () => {
    const plan = makePlan({ isActive: false, nextRunDate: noon('2027-01-02') });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02')),
      payment(2, noon('2026-12-02')),
      payment(INSTALMENT_PAYOFF_NUMBER, '2026-12-20T09:00:00.000Z', 2000, { id: 'payoff' }),
    ]);
    expect(progress.paidOff).toBe(true);
    expect(progress.complete).toBe(true);
    expect(progress.paidCount).toBe(12);
    expect(progress.paidAmount).toBe(2400);
    expect(progress.leftAmount).toBe(0);
    expect(progress.next).toBeNull();
    expect(progress.payoffTransactionId).toBe('payoff');
    expect(progress.entries[5]).toMatchObject({ status: 'paid_off', transactionId: 'payoff' });
  });

  it('is complete once the last payment is made', () => {
    const plan = makePlan({ instalmentCount: 3, instalmentTotal: 1000, isActive: false });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02'), 333.33),
      payment(2, noon('2026-12-02'), 333.33),
      payment(3, noon('2027-01-02'), 333.34),
    ]);
    expect(progress.complete).toBe(true);
    expect(progress.paidAmount).toBe(1000);
    expect(progress.entries.map((entry) => entry.amount)).toEqual([333.33, 333.33, 333.34]);
  });

  it('finds the payment the plan is on by the nearest date, wherever it was stored', () => {
    // Moved on by a phone in another time zone, which put the same payment
    // most of a day earlier (the day before, locally).
    const earlier = new Date(Date.parse(noon('2026-12-02')) - 20 * 3_600_000).toISOString();
    const progress = buildInstalmentProgress(makePlan({ nextRunDate: earlier }), [
      payment(1, noon('2026-11-02')),
    ]);
    expect(progress.entries[1]?.status).toBe('upcoming');
    expect(progress.next?.number).toBe(2);
  });

  it('leaves a skipped payment skipped when the rest is paid off', () => {
    const plan = makePlan({
      instalmentCount: 6,
      instalmentTotal: 600,
      isActive: false,
      nextRunDate: noon('2027-02-02'),
    });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02'), 100),
      payment(2, noon('2026-12-02'), 100),
      payment(INSTALMENT_PAYOFF_NUMBER, '2027-01-20T09:00:00.000Z', 300, { id: 'payoff' }),
    ]);
    expect(progress.entries.map((entry) => entry.status)).toEqual([
      'paid',
      'paid',
      'skipped',
      'paid_off',
      'paid_off',
      'paid_off',
    ]);
    expect(progress.paidCount).toBe(5);
    expect(progress.paidAmount).toBe(500);
  });

  it('counts only rows that are a scheduled payment', () => {
    const plan = makePlan({ instalmentCount: 3, instalmentTotal: 300 });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02'), 100),
      payment(9, noon('2026-11-03'), 50),
    ]);
    expect(progress.paidAmount).toBe(100);
  });

  it('uses the amount actually paid when a payment was edited', () => {
    const plan = makePlan({ nextRunDate: noon('2026-12-02') });
    const progress = buildInstalmentProgress(plan, [payment(1, noon('2026-11-02'), 210)]);
    expect(progress.paidAmount).toBe(210);
    // Still balances to the total: the last payment takes the difference.
    expect(progress.leftAmount).toBe(2190);
    expect(progress.entries[0]?.amount).toBe(210);
    expect(progress.entries[11]?.amount).toBe(190);
  });

  it('pays the bank’s amount each time and balances the total on the last payment', () => {
    const plan = makePlan({
      instalmentTotal: 1000,
      amount: 83.34,
      nextRunDate: noon('2026-12-02'),
    });
    const progress = buildInstalmentProgress(plan, [payment(1, noon('2026-11-02'), 83.34)]);
    expect(progress.entries.slice(1, 11).every((entry) => entry.amount === 83.34)).toBe(true);
    expect(progress.entries[11]?.amount).toBe(83.26);
    expect(progress.leftAmount).toBe(916.66);
  });

  it('balances a plan whose amount changed part way', () => {
    // Two payments at the even split, then the amount set to 90.
    const plan = makePlan({
      instalmentCount: 4,
      instalmentTotal: 400,
      amount: 90,
      nextRunDate: noon('2027-01-02'),
    });
    const progress = buildInstalmentProgress(plan, [
      payment(1, noon('2026-11-02'), 100),
      payment(2, noon('2026-12-02'), 100),
    ]);
    expect(progress.entries.map((entry) => entry.amount)).toEqual([100, 100, 90, 110]);
    expect(progress.leftAmount).toBe(200);
  });
});

describe('instalmentAmounts', () => {
  it('uses the regular amount and gives the last payment the rest', () => {
    expect(instalmentAmounts(1000, 12, 83.34)).toEqual([...Array(11).fill(83.34), 83.26]);
    // Interest: the payments are more than the price, so the last is small.
    expect(instalmentAmounts(1000, 12, 90)).toEqual([...Array(11).fill(90), 10]);
  });

  it('falls back to the even split when the amount leaves nothing for the last', () => {
    expect(instalmentAmounts(1000, 12, 100)).toEqual(splitInstalmentAmounts(1000, 12));
    expect(instalmentAmounts(1000, 12, null)).toEqual(splitInstalmentAmounts(1000, 12));
    expect(isRegularAmountValid(1000, 12, 90.9)).toBe(true);
    expect(isRegularAmountValid(1000, 12, 90.91)).toBe(false);
    expect(isRegularAmountValid(1000, 12, 0)).toBe(false);
  });

  it('tells interest from rounding', () => {
    expect(regularAmountImpliesOtherTotal(1000, 12, 83.34)).toBe(false);
    expect(regularAmountImpliesOtherTotal(1000, 12, 90)).toBe(true);
  });
});

describe('instalmentDueBetween', () => {
  it('sums the upcoming payments inside the window', () => {
    const first = buildInstalmentProgress(makePlan({ nextRunDate: noon('2026-12-02') }), [
      payment(1, noon('2026-11-02')),
    ]);
    const second = buildInstalmentProgress(
      makePlan({
        id: 'sofa',
        amount: 433,
        instalmentCount: 3,
        instalmentTotal: 1299,
        instalmentStartDate: noon('2026-12-15'),
        nextRunDate: noon('2026-12-15'),
      }),
      [],
    );
    const identity = (amount: number) => amount;
    expect(instalmentDueBetween([first, second], '2026-12-01', '2026-12-31', identity)).toBe(633);
    expect(instalmentDueBetween([first, second], '2026-11-01', '2026-11-30', identity)).toBe(0);
  });
});

describe('paymentRowsForPlan', () => {
  const plan = makePlan();
  const base = { amount: 200, deletedAt: null, instalmentNumber: null };

  it('keeps rows that name the plan', () => {
    const rows = paymentRowsForPlan(plan, [
      {
        ...base,
        id: 'a',
        date: noon('2026-11-02'),
        instalmentRuleId: 'plan1',
        instalmentNumber: 1,
      },
      {
        ...base,
        id: 'b',
        date: noon('2026-11-02'),
        instalmentRuleId: 'other',
        instalmentNumber: 1,
      },
      { ...base, id: 'c', date: noon('2026-11-02'), instalmentRuleId: null },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['a']);
  });

  it('numbers a run written by an older app version from its run id', () => {
    const rows = paymentRowsForPlan(plan, [
      {
        ...base,
        id: `rr:plan1:${noon('2026-12-02').slice(0, 10)}`,
        date: noon('2026-12-02'),
        instalmentRuleId: null,
      },
      {
        ...base,
        id: `rr:plan1:${noon('2031-01-02').slice(0, 10)}`,
        date: noon('2031-01-02'),
        instalmentRuleId: null,
      },
      {
        ...base,
        id: `rr:plan10:${noon('2026-12-02').slice(0, 10)}`,
        date: noon('2026-12-02'),
        instalmentRuleId: null,
      },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        id: `rr:plan1:${noon('2026-12-02').slice(0, 10)}`,
        instalmentNumber: 2,
      }),
    ]);
  });
});

describe('paymentRowsForPlan (older app versions)', () => {
  const plan = makePlan();
  const legacy = (day: string) => ({
    id: `rr:plan1:${day}`,
    amount: 200,
    date: `${day}T12:00:00.000Z`,
    deletedAt: null,
    instalmentNumber: null,
    instalmentRuleId: null,
  });

  it('numbers a run a few days off the schedule by the nearest payment', () => {
    // That app walks months in UTC from its previous run, so its day drifts.
    const rows = paymentRowsForPlan(plan, [legacy('2026-12-01'), legacy('2027-01-03')]);
    expect(rows.map((row) => row.instalmentNumber)).toEqual([2, 3]);
  });

  it('never gives one payment two runs, nor takes a run half a period away', () => {
    const rows = paymentRowsForPlan(plan, [
      { ...legacy('2026-12-02'), instalmentRuleId: 'plan1', instalmentNumber: 2 },
      legacy('2026-12-03'),
      legacy('2027-01-17'),
    ]);
    // The second December run is a month from any free payment and the
    // mid-January one half a month: neither is a payment of the plan.
    expect(rows.map((row) => [row.id, row.instalmentNumber])).toEqual([['rr:plan1:2026-12-02', 2]]);
  });
});

describe('buildInstalmentPlans', () => {
  it('collects each plan’s payments and lists active plans first', () => {
    const done = makePlan({
      id: 'done',
      instalmentCount: 2,
      instalmentTotal: 400,
      isActive: false,
    });
    const active = makePlan({ id: 'active', nextRunDate: noon('2026-12-02') });
    const ordinary = { ...makePlan({ id: 'rent' }), instalmentCount: null };
    const rows = [
      {
        id: 'x1',
        amount: 200,
        date: noon('2026-11-02'),
        deletedAt: null,
        instalmentRuleId: 'done',
        instalmentNumber: 1,
      },
      {
        id: 'x2',
        amount: 200,
        date: noon('2026-12-02'),
        deletedAt: null,
        instalmentRuleId: 'done',
        instalmentNumber: 2,
      },
      {
        id: `rr:active:${noon('2026-11-02').slice(0, 10)}`,
        amount: 200,
        date: noon('2026-11-02'),
        deletedAt: null,
        instalmentRuleId: null,
        instalmentNumber: null,
      },
      {
        id: 'rr:rent:2026-11-02',
        amount: 200,
        date: noon('2026-11-02'),
        deletedAt: null,
        instalmentRuleId: null,
        instalmentNumber: null,
      },
    ];
    const plans = buildInstalmentPlans([done, ordinary, active], rows);
    expect(plans.map((plan) => plan.rule.id)).toEqual(['active', 'done']);
    expect(plans[0]?.paidCount).toBe(1);
    expect(plans[1]?.complete).toBe(true);
    expect(plans[1]?.paidAmount).toBe(400);
  });
});

describe('instalmentPaymentCandidates', () => {
  const rows = [
    {
      id: 'a',
      amount: 1,
      date: noon('2026-11-02'),
      deletedAt: null,
      instalmentRuleId: 'plan1',
      instalmentNumber: 1,
    },
    {
      id: 'rr:rent:2026-11-02',
      amount: 1,
      date: noon('2026-11-02'),
      deletedAt: null,
      instalmentRuleId: null,
      instalmentNumber: null,
    },
    {
      id: 'coffee',
      amount: 1,
      date: noon('2026-11-02'),
      deletedAt: null,
      instalmentRuleId: null,
      instalmentNumber: null,
    },
  ];

  it('keeps plan rows and run ids, and nothing without a plan', () => {
    expect(instalmentPaymentCandidates([makePlan()], rows).map((row) => row.id)).toEqual([
      'a',
      'rr:rent:2026-11-02',
    ]);
    expect(instalmentPaymentCandidates([{ ...makePlan(), instalmentCount: null }], rows)).toEqual(
      [],
    );
  });

  it('keys change only when a payment row does', () => {
    const before = instalmentPaymentsKey(rows);
    expect(instalmentPaymentsKey([...rows])).toBe(before);
    expect(instalmentPaymentsKey([{ ...rows[0]!, amount: 2 }, ...rows.slice(1)])).not.toBe(before);
  });
});
