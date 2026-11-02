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

/** Local midnight of a day key, as the runner writes run dates. */
const midnight = (dayKey: string) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
};

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
    anchorDay: null,
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
    ).toEqual(['2026-07-30', midnight('2026-08-30'), midnight('2026-09-30')]);
    expect(rule.nextRunDate).toBe(midnight('2026-10-30'));
    expect(rule.isActive).toBe(false);
    expect(recurringRulesRepository.runDueTransactions('2026-10-31T00:00:00.000Z')).toEqual([]);
    expect(transactionsRepository.createWithId).toHaveBeenCalledTimes(3);
  });

  it('keeps the rule active while its final installment is still pending', () => {
    const rule = useRule(makeLoanRule());
    recurringRulesRepository.runDueTransactions('2026-08-31T23:59:59.999Z');

    expect(transactionsRepository.createWithId).toHaveBeenCalledTimes(2);
    expect(rule.nextRunDate).toBe(midnight('2026-09-30'));
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

/** A database that records what `create` and `update` write. */
function useWrites(current?: { nextRunDate: string }) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  (getDb as jest.Mock).mockReturnValue({
    insert: () => ({
      values: (values: Record<string, unknown>) => ({ run: () => inserted.push(values) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({ run: () => updated.push(values) }),
      }),
    }),
    select: () => ({ from: () => ({ where: () => ({ get: () => current }) }) }),
  });
  return { inserted, updated };
}

const ruleInput = {
  name: 'Rent',
  type: 'expense' as const,
  amount: 1200,
  currency: 'MYR',
  accountId: 'cash',
  categoryId: 'rent',
  recurrencePattern: 'monthly' as const,
};

describe('anchor days on saved rules', () => {
  beforeEach(() => jest.clearAllMocks());

  it("anchors a new rule on its first run's day", () => {
    const { inserted } = useWrites();
    recurringRulesRepository.create({ ...ruleInput, nextRunDate: midnight('2026-01-31') });
    expect(inserted[0]?.anchorDay).toBe(31);
  });

  it('keeps an anchor the caller gives over a shortened first run', () => {
    const { inserted } = useWrites();
    recurringRulesRepository.create({ ...ruleInput, nextRunDate: '2026-11-30', anchorDay: 31 });
    expect(inserted[0]?.anchorDay).toBe(31);
  });

  it('keeps the anchor when an edit saves the date the rule already had', () => {
    // A rule on the 31st waiting on November 30; the editor sends that day back.
    const { updated } = useWrites({ nextRunDate: midnight('2026-11-30') });
    recurringRulesRepository.update('r1', { amount: 1300, nextRunDate: '2026-11-30' });
    expect(updated[0]).toHaveProperty('anchorDay', undefined);
    expect(updated[0]?.amount).toBe(1300);
  });

  it('re-anchors when an edit moves the rule to another day', () => {
    const { updated } = useWrites({ nextRunDate: midnight('2026-11-30') });
    recurringRulesRepository.update('r1', { nextRunDate: '2026-12-15' });
    expect(updated[0]?.anchorDay).toBe(15);
  });

  it('leaves the anchor alone when the date is not part of the edit', () => {
    const { updated } = useWrites({ nextRunDate: midnight('2026-11-30') });
    recurringRulesRepository.update('r1', { amount: 5 });
    expect(updated[0]).toHaveProperty('anchorDay', undefined);
  });
});

describe('running an anchored rule', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns to the anchor day after a shorter month', () => {
    const rule = useRule(makeLoanRule({ nextRunDate: '2026-02-28', anchorDay: 31, endDate: null }));
    recurringRulesRepository.runDueTransactions(new Date(2026, 2, 31, 23, 59).toISOString());
    expect(
      jest.mocked(transactionsRepository.createWithId).mock.calls.map(([, input]) => input.date),
    ).toEqual(['2026-02-28', midnight('2026-03-31')]);
    expect(rule.nextRunDate).toBe(midnight('2026-04-30'));
    expect(rule.anchorDay).toBe(31);
  });

  it('leaves a missing anchor for the repair to fill', () => {
    const rule = useRule(makeLoanRule({ nextRunDate: '2026-02-28', endDate: null }));
    recurringRulesRepository.runDueTransactions(new Date(2026, 2, 31, 23, 59).toISOString());
    // February 28 and March 28 ran; without an anchor it stays on the 28th.
    expect(rule.nextRunDate).toBe(midnight('2026-04-28'));
    expect(rule.anchorDay).toBeNull();
  });
});

describe('repairLegacySchedules', () => {
  beforeEach(() => jest.clearAllMocks());

  /** A database holding one rule saved before anchor days, its runs and its target. */
  function useLegacyRule(options: {
    rule: Record<string, unknown>;
    runs: { id: string; date: string }[];
    target?: Record<string, unknown>;
  }) {
    const writes: Record<string, unknown>[] = [];
    (getDb as jest.Mock).mockReturnValue({
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            all: () => (table === recurringRulesTable ? [options.rule] : options.runs),
            get: () => (table === accountsTable ? options.target : undefined),
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({ run: () => writes.push(values) }),
        }),
      }),
    });
    return writes;
  }

  it("anchors a loan's repayment on its payment day and moves the next run back onto it", () => {
    const writes = useLegacyRule({
      rule: {
        id: 'repayment',
        type: 'transfer',
        toAccountId: 'loan',
        recurrencePattern: 'monthly',
        recurrenceInterval: 1,
        // What older versions stored after three runs from January 31.
        nextRunDate: '2026-04-28T00:00:00.000Z',
        createdAt: '2026-01-10T00:00:00.000Z',
      },
      runs: [
        { id: 'rr:repayment:2026-01-31', date: '2026-01-31' },
        { id: 'rr:repayment:2026-02-28', date: '2026-02-28T00:00:00.000Z' },
        { id: 'rr:repayment:2026-03-28', date: '2026-03-28T00:00:00.000Z' },
        // A run the user later moved: it no longer says where the schedule was,
        // and read as a run it would start the schedule on the 28th.
        { id: 'rr:repayment:2025-12-31', date: '2025-12-28T00:00:00.000Z' },
      ],
      target: { type: 'loan', loanPaymentDay: 31 },
    });
    recurringRulesRepository.repairLegacySchedules();
    expect(writes).toEqual([{ anchorDay: 31, nextRunDate: midnight('2026-04-30') }]);
  });

  it("anchors a goal's auto-save on the day it was set up", () => {
    const writes = useLegacyRule({
      rule: {
        id: 'save',
        type: 'transfer',
        toAccountId: 'trip',
        recurrencePattern: 'monthly',
        recurrenceInterval: 1,
        nextRunDate: '2026-02-28',
        createdAt: new Date(2026, 0, 31, 9, 30).toISOString(),
      },
      runs: [],
      target: { type: 'goal', loanPaymentDay: null },
    });
    recurringRulesRepository.repairLegacySchedules();
    expect(writes).toEqual([{ anchorDay: 31, nextRunDate: '2026-02-28' }]);
  });
});
