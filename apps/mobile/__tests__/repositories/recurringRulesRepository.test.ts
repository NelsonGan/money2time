jest.mock('~/lib/db/client', () => ({ getDb: jest.fn() }));
jest.mock('~/lib/repositories/transactionsRepository', () => ({
  transactionsRepository: { create: jest.fn(), createWithId: jest.fn() },
}));
jest.mock('~/lib/repositories/exchangeRatesRepository', () => ({
  exchangeRatesRepository: { listByBase: () => [] },
}));

import { getDb } from '~/lib/db/client';
import { accountsTable, recurringRulesTable, transactionsTable } from '~/lib/db/schema';
import {
  recurringRulesRepository,
  recurringRunTransactionId,
} from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type { RecurringTransactionRule } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

function makeLoanRule(overrides: Partial<RecurringTransactionRule> = {}): RecurringTransactionRule {
  return {
    id: 'repayment',
    name: 'Loan repayment',
    type: 'transfer',
    amount: 100,
    currency: 'MYR',
    toAmount: null,
    accountId: null,
    fromAccountId: 'cash',
    toAccountId: 'loan',
    categoryId: null,
    note: null,
    logoId: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: '2026-07-30',
    endDate: '2026-09-30',
    isActive: true,
    countsAsExpense: false,
    instalmentCount: null,
    instalmentTotal: null,
    instalmentStartDate: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

/** Exercise the runner's scheduling logic while replacing database I/O. */
function useRule(rule: RecurringTransactionRule) {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    all: () => (rule.isActive ? [rule] : []),
  };
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === recurringRulesTable) return query;
        // No run exists yet (the id lookup before each insert).
        if (table === transactionsTable) return { where: () => ({ get: () => undefined }) };
        if (table === accountsTable) {
          return {
            all: () => [
              { id: 'cash', currency: 'MYR' },
              { id: 'loan', currency: 'MYR' },
            ],
          };
        }
        return { get: () => ({ c: 'MYR' }) };
      },
    }),
    update: () => ({
      set: (values: Partial<RecurringTransactionRule>) => ({
        where: () => ({ run: () => Object.assign(rule, values) }),
      }),
    }),
  };
  (getDb as jest.Mock).mockReturnValue(db);
  return rule;
}

describe('loan recurring end dates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes all three installments including the bare final date, then stops', () => {
    const rule = useRule(makeLoanRule());
    recurringRulesRepository.runDueTransactions('2026-09-30T23:59:59.999Z');

    expect(
      jest.mocked(transactionsRepository.createWithId).mock.calls.map(([, input]) => input.date),
    ).toEqual(['2026-07-30', '2026-08-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z']);
    expect(rule.nextRunDate).toBe('2026-10-30T00:00:00.000Z');
    expect(rule.isActive).toBe(false);
    expect(recurringRulesRepository.runDueTransactions('2026-10-31T00:00:00.000Z')).toEqual([]);
    expect(transactionsRepository.createWithId).toHaveBeenCalledTimes(3);
  });

  it('keeps the rule active while its final installment is still pending', () => {
    const rule = useRule(makeLoanRule());
    recurringRulesRepository.runDueTransactions('2026-08-31T23:59:59.999Z');

    expect(transactionsRepository.createWithId).toHaveBeenCalledTimes(2);
    expect(rule.nextRunDate).toBe('2026-09-30T00:00:00.000Z');
    expect(rule.isActive).toBe(true);
  });

  it('writes a final installment whose cursor has already advanced to an ISO timestamp', () => {
    const rule = useRule(
      makeLoanRule({ nextRunDate: new Date('2026-09-30T23:59:58').toISOString() }),
    );
    recurringRulesRepository.runDueTransactions(new Date('2026-09-30T23:59:59').toISOString());

    expect(transactionsRepository.createWithId).toHaveBeenCalledTimes(1);
    expect(transactionsRepository.createWithId).toHaveBeenCalledWith(
      'rr:repayment:2026-09-30',
      expect.objectContaining({ date: new Date('2026-09-30T23:59:58').toISOString(), amount: 100 }),
    );
    expect(rule.isActive).toBe(false);
  });

  it('does not write an occurrence after an explicit timestamp cutoff', () => {
    const rule = useRule(
      makeLoanRule({
        nextRunDate: new Date('2026-09-30T13:00:00').toISOString(),
        endDate: new Date('2026-09-30T12:00:00').toISOString(),
      }),
    );
    recurringRulesRepository.runDueTransactions(new Date('2026-09-30T23:59:59').toISOString());

    expect(transactionsRepository.createWithId).not.toHaveBeenCalled();
    expect(rule.isActive).toBe(false);
  });

  it('names each run after its rule and date, so two phones make the same row', () => {
    useRule(makeLoanRule());
    recurringRulesRepository.runDueTransactions('2026-08-31T23:59:59.999Z');
    expect(jest.mocked(transactionsRepository.createWithId).mock.calls.map(([id]) => id)).toEqual([
      'rr:repayment:2026-07-30',
      'rr:repayment:2026-08-30',
    ]);
  });
});

describe('recurringRunTransactionId', () => {
  it('uses the run day only', () => {
    expect(recurringRunTransactionId('r1', '2026-08-30T00:00:00.000Z')).toBe('rr:r1:2026-08-30');
    expect(recurringRunTransactionId('r1', '2026-08-30')).toBe('rr:r1:2026-08-30');
  });
});

/** Local noon on a day: the same calendar day in UTC in every time zone. */
function noon(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12).toISOString();
}

/** The last moment of a local day. */
function endOfDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999).toISOString();
}

describe('instalment plans', () => {
  beforeEach(() => jest.clearAllMocks());

  function makePlanRule(overrides: Partial<RecurringTransactionRule> = {}) {
    return makeLoanRule({
      id: 'plan',
      name: 'Sofa',
      type: 'expense',
      amount: 333.33,
      accountId: 'cash',
      fromAccountId: null,
      toAccountId: null,
      categoryId: 'home',
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      nextRunDate: noon('2027-01-31'),
      endDate: noon('2027-03-31'),
      countsAsExpense: false,
      instalmentCount: 3,
      instalmentTotal: 1000,
      instalmentStartDate: noon('2027-01-31'),
      ...overrides,
    });
  }

  it('posts each due payment on the plan date with its own amount and number', () => {
    const rule = useRule(makePlanRule());
    const processed = recurringRulesRepository.runDueTransactions(endOfDay('2027-03-31'));

    const calls = jest.mocked(transactionsRepository.createWithId).mock.calls;
    expect(calls.map(([id]) => id)).toEqual([
      recurringRunTransactionId('plan', noon('2027-01-31')),
      recurringRunTransactionId('plan', noon('2027-02-28')),
      recurringRunTransactionId('plan', noon('2027-03-31')),
    ]);
    // Counted from the first payment: back on the 31st after February.
    expect(calls.map(([, input]) => dayKeyFromIsoLocal(input.date))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
    expect(calls.map(([, input]) => input.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(calls.map(([, input]) => input.instalmentNumber)).toEqual([1, 2, 3]);
    expect(calls.every(([, input]) => input.instalmentRuleId === 'plan')).toBe(true);
    expect(calls.every(([, input]) => input.type === 'expense')).toBe(true);
    expect(rule.isActive).toBe(false);
    expect(processed).toHaveLength(1);
  });

  it('stops at today and moves the plan on to its next payment', () => {
    const rule = useRule(makePlanRule());
    recurringRulesRepository.runDueTransactions(endOfDay('2027-02-28'));

    expect(transactionsRepository.createWithId).toHaveBeenCalledTimes(2);
    expect(rule.nextRunDate).toBe(noon('2027-03-31'));
    expect(rule.isActive).toBe(true);
  });

  it('moves past due payments it cannot post (no account) instead of staying due', () => {
    const rule = useRule(makePlanRule({ accountId: null }));
    recurringRulesRepository.runDueTransactions(endOfDay('2027-02-28'));

    expect(transactionsRepository.createWithId).not.toHaveBeenCalled();
    expect(rule.nextRunDate).toBe(noon('2027-03-31'));
    expect(rule.isActive).toBe(true);
  });

  it('skips payments before the plan’s next run date', () => {
    useRule(makePlanRule({ nextRunDate: noon('2027-03-31') }));
    recurringRulesRepository.runDueTransactions(endOfDay('2027-03-31'));

    expect(jest.mocked(transactionsRepository.createWithId).mock.calls.map(([id]) => id)).toEqual([
      recurringRunTransactionId('plan', noon('2027-03-31')),
    ]);
  });
});
