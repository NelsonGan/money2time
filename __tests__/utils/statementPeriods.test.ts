import type { TransactionWithRelations } from '~/types';
import {
  bucketTransactionsByAccountPeriod,
  clampStatementDate,
  formatStatementRangeSublabel,
  getCurrentStatementCycleStart,
  statementPeriodFromAnchor,
  statementPeriodKeyForTransactionDate,
} from '~/utils/statementPeriods';

function makeTx(id: string, date: string): TransactionWithRelations {
  return {
    id,
    type: 'expense',
    amount: 0,
    currency: 'USD',
    reportingCurrency: 'USD',
    reportingAmount: 0,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    receiptUri: null,
    date,
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
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
  };
}

describe('clampStatementDate', () => {
  it('clamps days past the end of the month', () => {
    // February 2026 has 28 days
    const result = clampStatementDate(2026, 1, 31);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it('clamps days below 1 to 1', () => {
    expect(clampStatementDate(2026, 4, 0).getDate()).toBe(1);
    expect(clampStatementDate(2026, 4, -5).getDate()).toBe(1);
  });

  it('passes through valid days', () => {
    expect(clampStatementDate(2026, 4, 15).getDate()).toBe(15);
  });
});

describe('getCurrentStatementCycleStart', () => {
  it('uses this-month statement day when it has already passed', () => {
    const now = new Date(2026, 4, 20); // May 20
    const cycleStart = getCurrentStatementCycleStart(15, now);
    expect(cycleStart.getMonth()).toBe(4);
    expect(cycleStart.getDate()).toBe(15);
  });

  it('falls back to last-month statement day when this month has not happened yet', () => {
    const now = new Date(2026, 4, 5); // May 5
    const cycleStart = getCurrentStatementCycleStart(15, now);
    expect(cycleStart.getMonth()).toBe(3); // April
    expect(cycleStart.getDate()).toBe(15);
  });
});

describe('statementPeriodFromAnchor', () => {
  it('produces a period spanning one month from the anchor', () => {
    const period = statementPeriodFromAnchor(new Date(2026, 4, 15), 15, 0);
    expect(period.start.getMonth()).toBe(4);
    expect(period.start.getDate()).toBe(15);
    expect(period.end.getMonth()).toBe(5);
    expect(period.end.getDate()).toBe(15);
    expect(period.key).toBe('2026-06');
  });

  it('respects positive offsets', () => {
    const period = statementPeriodFromAnchor(new Date(2026, 4, 15), 15, 2);
    expect(period.start.getMonth()).toBe(6);
    expect(period.end.getMonth()).toBe(7);
  });
});

describe('statementPeriodKeyForTransactionDate', () => {
  it('places dates after the statement day in the upcoming cycle', () => {
    // tx on May 20, statement day 15 → cycle starts May 15, ends Jun 15 → key '2026-06'
    expect(statementPeriodKeyForTransactionDate('2026-05-20T00:00:00.000Z', 15)).toBe('2026-06');
  });

  it('places dates before the statement day in the previous cycle', () => {
    // tx on May 10, statement day 15 → cycle starts Apr 15, ends May 15 → key '2026-05'
    expect(statementPeriodKeyForTransactionDate('2026-05-10T00:00:00.000Z', 15)).toBe('2026-05');
  });

  it('falls back to month key for invalid dates', () => {
    // monthKeyFromIsoLocal slices the first 7 characters when parsing fails
    expect(statementPeriodKeyForTransactionDate('not-a-date', 15)).toBe('not-a-d');
  });
});

describe('bucketTransactionsByAccountPeriod', () => {
  it('uses month keys when statementDay is null', () => {
    const txs = [makeTx('a', '2026-05-13T00:00:00.000Z'), makeTx('b', '2026-06-01T00:00:00.000Z')];
    const map = bucketTransactionsByAccountPeriod(txs, null);
    expect(Array.from(map.keys()).sort()).toEqual(['2026-05', '2026-06']);
  });

  it('uses statement period keys when statementDay is provided', () => {
    const txs = [
      makeTx('a', '2026-05-10T00:00:00.000Z'), // before day-15 cycle → 2026-05
      makeTx('b', '2026-05-20T00:00:00.000Z'), // after day-15 cycle → 2026-06
    ];
    const map = bucketTransactionsByAccountPeriod(txs, 15);
    expect(map.get('2026-05')?.map((t) => t.id)).toEqual(['a']);
    expect(map.get('2026-06')?.map((t) => t.id)).toEqual(['b']);
  });
});

describe('formatStatementRangeSublabel', () => {
  it('joins formatted start/end dates with an en-dash', () => {
    const label = formatStatementRangeSublabel(new Date(2026, 4, 1), new Date(2026, 4, 31), 'en');
    expect(label).toMatch(/.+–.+/);
    expect(label.toLowerCase()).toContain('may');
  });
});
