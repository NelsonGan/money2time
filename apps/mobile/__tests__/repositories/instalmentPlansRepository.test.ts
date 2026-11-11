jest.mock('~/lib/db/client', () => ({ getDb: jest.fn(), getSQLite: jest.fn() }));
jest.mock('~/lib/repositories/transactionsRepository', () => ({
  transactionsRepository: {
    createWithId: jest.fn(),
    softDelete: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('~/lib/repositories/exchangeRatesRepository', () => ({
  exchangeRatesRepository: { listByBase: () => [] },
}));
jest.mock('~/lib/repositories/ledgersRepository', () => ({
  ledgersRepository: { activeReportingCurrency: () => ({ code: 'MYR' }) },
}));
jest.mock('~/utils/id', () => ({
  newId: () => 'plan',
  nowIso: () => '2026-11-02T10:00:00.000Z',
}));

import { getDb, getSQLite } from '~/lib/db/client';
import { accountsTable, recurringRulesTable, transactionsTable } from '~/lib/db/schema';
import {
  recurringRulesRepository,
  recurringRunTransactionId,
} from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';

/** Local noon on a day: the same calendar day in UTC in most time zones. */
function noon(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12).toISOString();
}

type Row = Record<string, unknown>;
interface PaymentRow {
  id: string;
  amount: number;
  date: string;
  instalment_rule_id: string | null;
  instalment_number: number | null;
  deleted_at: string | null;
}

/**
 * A database with one rule row, an id set for the "already written" checks,
 * and the payment rows `instalmentPayments` reads back.
 */
function useFakeDb({
  rule = null,
  takenIds = [],
  payments = [],
}: {
  rule?: Row | null;
  takenIds?: string[];
  payments?: PaymentRow[];
} = {}) {
  const state = { rule, inserted: 0 };
  const taken = new Set(takenIds);
  const db = {
    insert: () => ({
      values: (values: Row) => ({
        run: () => {
          state.rule = { ...values };
          state.inserted += 1;
        },
      }),
    }),
    select: () => ({
      from: (table: unknown) => {
        if (table === accountsTable) return { all: () => [{ id: 'card', currency: 'MYR' }] };
        if (table === transactionsTable) {
          return {
            where: () => ({
              // The id under test is the one most recently asked for; the
              // fake answers "taken" for any id in the set.
              get: () => (taken.size > 0 ? { id: [...taken][0] } : undefined),
            }),
          };
        }
        if (table === recurringRulesTable) {
          return {
            where: () => ({
              get: () => (state.rule && !state.rule.deletedAt ? state.rule : undefined),
            }),
          };
        }
        return { where: () => ({ get: () => undefined }) };
      },
    }),
    update: () => ({
      set: (values: Row) => ({
        where: () => ({
          run: () => {
            if (state.rule) Object.assign(state.rule, values);
          },
        }),
      }),
    }),
  };
  (getDb as jest.Mock).mockReturnValue(db);
  (getSQLite as jest.Mock).mockReturnValue({
    getAllSync: () => payments,
    withTransactionSync: (write: () => void) => write(),
  });
  return state;
}

function planRow(overrides: Row = {}): Row {
  return {
    id: 'plan',
    ledgerId: 'default',
    name: 'Sofa',
    type: 'expense',
    amount: 333.33,
    currency: 'MYR',
    toAmount: null,
    accountId: 'card',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'home',
    note: 'Sofa',
    logoId: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: noon('2026-12-02'),
    endDate: noon('2027-01-02'),
    isActive: true,
    countsAsExpense: false,
    instalmentCount: 3,
    instalmentTotal: 1000,
    instalmentStartDate: noon('2026-11-02'),
    createdAt: noon('2026-11-02'),
    updatedAt: noon('2026-11-02'),
    deletedAt: null,
    ...overrides,
  };
}

function payment(number: number, date: string, overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: `p${number}`,
    amount: 333.33,
    date,
    instalment_rule_id: 'plan',
    instalment_number: number,
    deleted_at: null,
    ...overrides,
  };
}

const PLAN_INPUT = {
  name: 'Sofa',
  total: 1000,
  count: 3,
  currency: 'MYR',
  accountId: 'card',
  categoryId: 'home',
  note: 'Sofa',
  recurrencePattern: 'monthly' as const,
  recurrenceInterval: 1,
};

describe('createInstalmentPlan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('makes the first payment at once when it is due, keeping the form extras', () => {
    const state = useFakeDb();
    const created = recurringRulesRepository.createInstalmentPlan(
      {
        ...PLAN_INPUT,
        startDate: noon('2026-11-02'),
        firstPayment: { receiptUri: 'receipts/a.jpg', details: 'Living room', reimbursable: true },
      },
      noon('2026-11-02'),
    );

    const firstId = recurringRunTransactionId('plan', noon('2026-11-02'));
    expect(created).toEqual({ ruleId: 'plan', firstPaymentId: firstId });
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      firstId,
      expect.objectContaining({
        type: 'expense',
        amount: 333.33,
        date: noon('2026-11-02'),
        accountId: 'card',
        categoryId: 'home',
        receiptUri: 'receipts/a.jpg',
        details: 'Living room',
        reimbursable: true,
        instalmentRuleId: 'plan',
        instalmentNumber: 1,
      }),
    );
    expect(state.rule).toMatchObject({
      instalmentCount: 3,
      instalmentTotal: 1000,
      instalmentStartDate: noon('2026-11-02'),
      nextRunDate: noon('2026-12-02'),
      endDate: noon('2027-01-02'),
      isActive: true,
    });
  });

  it('keeps the person picked in Belongs to on the plan and its payments', () => {
    const state = useFakeDb();
    recurringRulesRepository.createInstalmentPlan(
      { ...PLAN_INPUT, startDate: noon('2026-11-02'), memberId: 'user-ana' },
      noon('2026-11-02'),
    );
    expect(state.rule).toMatchObject({ memberId: 'user-ana' });
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ createdBy: 'user-ana', memberId: 'user-ana' }),
    );
  });

  it('leaves a later first payment to the runner', () => {
    const state = useFakeDb();
    const created = recurringRulesRepository.createInstalmentPlan(
      { ...PLAN_INPUT, startDate: noon('2026-12-15') },
      noon('2026-11-02'),
    );

    expect(created).toEqual({ ruleId: 'plan', firstPaymentId: null });
    expect(transactionsRepository.createWithId).not.toHaveBeenCalled();
    expect(state.rule).toMatchObject({ nextRunDate: noon('2026-12-15'), isActive: true });
  });

  it('uses the bank’s payment amount, and refuses one that leaves nothing for the last', () => {
    const state = useFakeDb();
    recurringRulesRepository.createInstalmentPlan(
      { ...PLAN_INPUT, regularAmount: 333.4, startDate: noon('2026-11-02') },
      noon('2026-11-02'),
    );
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ amount: 333.4, instalmentNumber: 1 }),
    );
    expect(state.rule).toMatchObject({ amount: 333.4, instalmentTotal: 1000 });

    expect(
      recurringRulesRepository.createInstalmentPlan({
        ...PLAN_INPUT,
        regularAmount: 500,
        startDate: noon('2026-11-02'),
      }),
    ).toBeNull();
  });

  it('refuses a plan with no total or fewer than two payments', () => {
    const state = useFakeDb();
    const today = noon('2026-11-02');
    expect(
      recurringRulesRepository.createInstalmentPlan({ ...PLAN_INPUT, total: 0, startDate: today }),
    ).toBeNull();
    expect(
      recurringRulesRepository.createInstalmentPlan({ ...PLAN_INPUT, count: 1, startDate: today }),
    ).toBeNull();
    expect(state.inserted).toBe(0);
  });
});

/** An expense saved already, as the editor or a receipt scan left it. */
function savedExpense(overrides: Row = {}): Row {
  return {
    id: 'tx-sofa',
    type: 'expense',
    amount: 1000,
    currency: 'MYR',
    reportingAmount: 1000,
    accountAmount: null,
    date: noon('2026-11-02'),
    accountId: 'card',
    categoryId: 'home',
    note: 'Sofa',
    memberId: null,
    instalmentRuleId: null,
    feeOfId: null,
    reimbursedAt: null,
    reimbursementTransactionId: null,
    splits: [],
    ...overrides,
  };
}

describe('convertTransactionToInstalmentPlan', () => {
  beforeEach(() => jest.clearAllMocks());

  const CONVERT_INPUT = {
    transactionId: 'tx-sofa',
    count: 3,
    recurrencePattern: 'monthly' as const,
    recurrenceInterval: 1,
  };

  it('makes the expense payment 1, keeping its row, and waits on payment 2', () => {
    const state = useFakeDb();
    (transactionsRepository.getById as jest.Mock).mockReturnValue(savedExpense());

    expect(recurringRulesRepository.convertTransactionToInstalmentPlan(CONVERT_INPUT)).toBe('plan');

    expect(transactionsRepository.update).toHaveBeenCalledWith('tx-sofa', {
      amount: 333.33,
      reportingAmount: 333.33,
      accountAmount: null,
      instalmentRuleId: 'plan',
      instalmentNumber: 1,
    });
    // Nothing new is written for payment 1: the expense is it.
    expect(transactionsRepository.createWithId).not.toHaveBeenCalled();
    expect(state.rule).toMatchObject({
      name: 'Sofa',
      amount: 333.33,
      accountId: 'card',
      categoryId: 'home',
      instalmentCount: 3,
      instalmentTotal: 1000,
      instalmentStartDate: noon('2026-11-02'),
      nextRunDate: noon('2026-12-02'),
      endDate: noon('2027-01-02'),
      isActive: true,
    });
  });

  it('shrinks the frozen reporting and account values with the amount', () => {
    useFakeDb();
    (transactionsRepository.getById as jest.Mock).mockReturnValue(
      savedExpense({ currency: 'USD', amount: 300, reportingAmount: 1410, accountAmount: 1410 }),
    );

    recurringRulesRepository.convertTransactionToInstalmentPlan(CONVERT_INPUT);

    expect(transactionsRepository.update).toHaveBeenCalledWith(
      'tx-sofa',
      expect.objectContaining({ amount: 100, reportingAmount: 470, accountAmount: 470 }),
    );
  });

  it('keeps whose expense it is on the plan, and uses the bank’s amount', () => {
    const state = useFakeDb();
    (transactionsRepository.getById as jest.Mock).mockReturnValue(
      savedExpense({ memberId: 'user-ana' }),
    );

    recurringRulesRepository.convertTransactionToInstalmentPlan({
      ...CONVERT_INPUT,
      regularAmount: 333.4,
    });

    expect(state.rule).toMatchObject({ memberId: 'user-ana', amount: 333.4 });
    expect(transactionsRepository.update).toHaveBeenCalledWith(
      'tx-sofa',
      expect.objectContaining({ amount: 333.4 }),
    );
  });

  it.each([
    ['a payment of a plan already', { instalmentRuleId: 'other-plan' }],
    ['income', { type: 'income' }],
    ['a transfer fee', { feeOfId: 'transfer' }],
    ['a reimbursed expense', { reimbursedAt: noon('2026-11-03') }],
    ['a split bill', { splits: [{ id: 'split' }] }],
    ['an expense with no category', { categoryId: null }],
    ['an amount too small to split', { amount: 0.02 }],
  ])('refuses %s', (_label, overrides) => {
    const state = useFakeDb();
    (transactionsRepository.getById as jest.Mock).mockReturnValue(savedExpense(overrides));

    expect(recurringRulesRepository.convertTransactionToInstalmentPlan(CONVERT_INPUT)).toBeNull();
    expect(state.inserted).toBe(0);
    expect(transactionsRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a deleted expense and a payment amount that does not fit', () => {
    const state = useFakeDb();
    (transactionsRepository.getById as jest.Mock).mockReturnValue(null);
    expect(recurringRulesRepository.convertTransactionToInstalmentPlan(CONVERT_INPUT)).toBeNull();

    (transactionsRepository.getById as jest.Mock).mockReturnValue(savedExpense());
    expect(
      recurringRulesRepository.convertTransactionToInstalmentPlan({
        ...CONVERT_INPUT,
        regularAmount: 500,
      }),
    ).toBeNull();
    expect(state.inserted).toBe(0);
  });
});

describe('payNextInstalment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('makes the next payment today under its scheduled run id and moves the plan on', () => {
    const state = useFakeDb({
      rule: planRow(),
      payments: [payment(1, noon('2026-11-02'))],
    });
    const id = recurringRulesRepository.payNextInstalment('plan', noon('2026-11-20'));

    const scheduledId = recurringRunTransactionId('plan', noon('2026-12-02'));
    expect(id).toBe(scheduledId);
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      scheduledId,
      expect.objectContaining({
        amount: 333.33,
        date: noon('2026-11-20'),
        instalmentRuleId: 'plan',
        instalmentNumber: 2,
      }),
    );
    expect(state.rule).toMatchObject({ nextRunDate: noon('2027-01-02'), isActive: true });
  });

  it('takes a fresh id when the scheduled one was used before', () => {
    useFakeDb({
      rule: planRow(),
      payments: [payment(1, noon('2026-11-02'))],
      takenIds: [recurringRunTransactionId('plan', noon('2026-12-02'))],
    });
    const id = recurringRulesRepository.payNextInstalment('plan', noon('2026-11-20'));
    expect(id).toBe(`${recurringRunTransactionId('plan', noon('2026-12-02'))}:plan`);
  });

  it('ends the plan when the last payment is made early', () => {
    const state = useFakeDb({
      rule: planRow({ nextRunDate: noon('2027-01-02') }),
      payments: [payment(1, noon('2026-11-02')), payment(2, noon('2026-12-02'))],
    });
    recurringRulesRepository.payNextInstalment('plan', noon('2026-12-20'));
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ amount: 333.34, instalmentNumber: 3 }),
    );
    expect(state.rule).toMatchObject({ isActive: false });
  });
});

describe('payOffInstalmentPlan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pays everything still to come in one payment and ends the plan', () => {
    const state = useFakeDb({
      rule: planRow(),
      payments: [payment(1, noon('2026-11-02'))],
    });
    const id = recurringRulesRepository.payOffInstalmentPlan('plan', noon('2026-11-20'));

    expect(id).toBe('rr:plan:payoff');
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      'rr:plan:payoff',
      expect.objectContaining({
        amount: 666.67,
        date: noon('2026-11-20'),
        instalmentRuleId: 'plan',
        instalmentNumber: 0,
      }),
    );
    expect(state.rule).toMatchObject({ isActive: false });
  });

  it('does nothing once nothing is left', () => {
    useFakeDb({
      rule: planRow({ isActive: false }),
      payments: [payment(1, noon('2026-11-02'))],
    });
    expect(recurringRulesRepository.payOffInstalmentPlan('plan')).toBeNull();
    expect(transactionsRepository.createWithId).not.toHaveBeenCalled();
  });
});

describe('deleteInstalmentPlan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the plan and returns the live payments for the caller', () => {
    const state = useFakeDb({
      rule: planRow(),
      payments: [
        payment(1, noon('2026-11-02')),
        payment(2, noon('2026-12-02'), { deleted_at: noon('2026-12-03') }),
      ],
    });
    expect(recurringRulesRepository.deleteInstalmentPlan('plan')).toEqual(['p1']);
    expect(state.rule?.deletedAt).toBeTruthy();
    expect(transactionsRepository.softDelete).not.toHaveBeenCalled();
  });
});
