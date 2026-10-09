jest.mock('~/lib/db/client', () => ({ getDb: jest.fn() }));
jest.mock('~/lib/repositories/transactionsRepository', () => ({
  transactionsRepository: { create: jest.fn() },
}));
jest.mock('~/lib/repositories/exchangeRatesRepository', () => ({
  exchangeRatesRepository: { listByBase: () => [] },
}));

import { getDb } from '~/lib/db/client';
import { accountsTable, recurringRulesTable } from '~/lib/db/schema';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type { RecurringTransactionRule } from '~/types';

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
      jest.mocked(transactionsRepository.create).mock.calls.map(([input]) => input.date),
    ).toEqual(['2026-07-30', '2026-08-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z']);
    expect(rule.nextRunDate).toBe('2026-10-30T00:00:00.000Z');
    expect(rule.isActive).toBe(false);
    expect(recurringRulesRepository.runDueTransactions('2026-10-31T00:00:00.000Z')).toEqual([]);
    expect(transactionsRepository.create).toHaveBeenCalledTimes(3);
  });

  it('keeps the rule active while its final installment is still pending', () => {
    const rule = useRule(makeLoanRule());
    recurringRulesRepository.runDueTransactions('2026-08-31T23:59:59.999Z');

    expect(transactionsRepository.create).toHaveBeenCalledTimes(2);
    expect(rule.nextRunDate).toBe('2026-09-30T00:00:00.000Z');
    expect(rule.isActive).toBe(true);
  });

  it('writes a final installment whose cursor has already advanced to an ISO timestamp', () => {
    const rule = useRule(
      makeLoanRule({ nextRunDate: new Date('2026-09-30T23:59:58').toISOString() }),
    );
    recurringRulesRepository.runDueTransactions(new Date('2026-09-30T23:59:59').toISOString());

    expect(transactionsRepository.create).toHaveBeenCalledTimes(1);
    expect(transactionsRepository.create).toHaveBeenCalledWith(
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

    expect(transactionsRepository.create).not.toHaveBeenCalled();
    expect(rule.isActive).toBe(false);
  });
});
