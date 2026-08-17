import type { TransactionWithRelations } from '~/types';
import {
  bucketTransactionsByAccountPeriod,
  clampStatementDate,
  computeCreditCycleSummary,
  creditDeltaForAccountTransaction,
  formatStatementRangeSublabel,
  getCreditCycleDates,
  getCurrentStatementCycleStart,
  nextOccurrenceOfMonthDay,
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

describe('nextOccurrenceOfMonthDay', () => {
  it('stays in the same month when the day is still ahead', () => {
    const result = nextOccurrenceOfMonthDay(15, new Date(2026, 4, 5)); // May 5
    expect(result.getMonth()).toBe(4);
    expect(result.getDate()).toBe(15);
  });

  it('rolls to the next month when the day has passed', () => {
    const result = nextOccurrenceOfMonthDay(15, new Date(2026, 4, 20)); // May 20
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  it('rolls to the next month when the day is today', () => {
    const result = nextOccurrenceOfMonthDay(15, new Date(2026, 4, 15)); // May 15
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  it('clamps to the end of short months', () => {
    const result = nextOccurrenceOfMonthDay(31, new Date(2026, 0, 31)); // Jan 31
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });
});

describe('getCreditCycleDates', () => {
  it('surfaces the last issued statement and its due date when unpaid', () => {
    const { statementDate, dueDate } = getCreditCycleDates(25, 1, new Date(2026, 6, 28), true);
    expect(statementDate?.getMonth()).toBe(6); // Jul 25
    expect(statementDate?.getDate()).toBe(25);
    expect(dueDate?.getMonth()).toBe(7); // Aug 1
    expect(dueDate?.getDate()).toBe(1);
  });

  it('uses the previous month statement when this month has not cut yet', () => {
    const { statementDate, dueDate } = getCreditCycleDates(25, 1, new Date(2026, 6, 20), true);
    expect(statementDate?.getMonth()).toBe(5); // Jun 25
    expect(statementDate?.getDate()).toBe(25);
    expect(dueDate?.getMonth()).toBe(6); // Jul 1
    expect(dueDate?.getDate()).toBe(1);
  });

  it('surfaces the upcoming statement and its due date when paid up', () => {
    const { statementDate, dueDate } = getCreditCycleDates(25, 1, new Date(2026, 6, 20), false);
    expect(statementDate?.getMonth()).toBe(6); // Jul 25
    expect(statementDate?.getDate()).toBe(25);
    expect(dueDate?.getMonth()).toBe(7); // Aug 1
    expect(dueDate?.getDate()).toBe(1);
  });

  it('advances a full cycle when paid up and past this month statement day', () => {
    const { statementDate, dueDate } = getCreditCycleDates(25, 1, new Date(2026, 6, 28), false);
    expect(statementDate?.getMonth()).toBe(7); // Aug 25
    expect(statementDate?.getDate()).toBe(25);
    expect(dueDate?.getMonth()).toBe(8); // Sep 1
    expect(dueDate?.getDate()).toBe(1);
  });

  it('returns only the next due date when no statement day is set', () => {
    const { statementDate, dueDate } = getCreditCycleDates(null, 10, new Date(2026, 6, 20), false);
    expect(statementDate).toBeNull();
    expect(dueDate?.getMonth()).toBe(7); // Aug 10
    expect(dueDate?.getDate()).toBe(10);
  });

  it('returns only the statement date when no due day is set', () => {
    const { statementDate, dueDate } = getCreditCycleDates(25, null, new Date(2026, 6, 20), false);
    expect(statementDate?.getDate()).toBe(25);
    expect(dueDate).toBeNull();
  });

  it('returns nothing when neither day is set', () => {
    expect(getCreditCycleDates(null, null, new Date(2026, 6, 20), false)).toEqual({
      statementDate: null,
      dueDate: null,
    });
  });
});

describe('formatStatementRangeSublabel', () => {
  it('joins formatted start/end dates with an en-dash', () => {
    const label = formatStatementRangeSublabel(new Date(2026, 4, 1), new Date(2026, 4, 31), 'en');
    expect(label).toMatch(/.+–.+/);
    expect(label.toLowerCase()).toContain('may');
  });
});

const CARD_ID = 'card-1';

function makeCardTx(
  overrides: Partial<TransactionWithRelations> & { date: string },
): TransactionWithRelations {
  return {
    ...makeTx(`tx-${overrides.date}-${overrides.type ?? 'expense'}`, overrides.date),
    ...overrides,
  };
}

describe('creditDeltaForAccountTransaction', () => {
  it('adds spend and subtracts refunds on the card', () => {
    const spend = makeCardTx({
      date: '2026-05-20T00:00:00.000Z',
      type: 'expense',
      amount: 30,
      accountId: CARD_ID,
    });
    const refund = makeCardTx({
      date: '2026-05-21T00:00:00.000Z',
      type: 'income',
      amount: 12,
      accountId: CARD_ID,
    });
    expect(creditDeltaForAccountTransaction(spend, CARD_ID)).toBe(30);
    expect(creditDeltaForAccountTransaction(refund, CARD_ID)).toBe(-12);
  });

  it('counts a foreign-currency charge at its card-currency value', () => {
    // MYR 100 spent on an SGD card, frozen at S$29.
    const tx = makeCardTx({
      date: '2026-05-20T00:00:00.000Z',
      type: 'expense',
      amount: 100,
      currency: 'MYR',
      accountAmount: 29,
      accountId: CARD_ID,
    });
    expect(creditDeltaForAccountTransaction(tx, CARD_ID)).toBe(29);
  });

  it('credits a cross-currency payment with the amount the card received', () => {
    // RM126.72 paid from an MYR account settles S$38.36 on the card.
    const payment = makeCardTx({
      date: '2026-05-22T00:00:00.000Z',
      type: 'transfer',
      amount: 126.72,
      currency: 'MYR',
      toAmount: 38.36,
      fromAccountId: 'bank-1',
      toAccountId: CARD_ID,
    });
    expect(creditDeltaForAccountTransaction(payment, CARD_ID)).toBe(-38.36);
  });

  it('sends a transfer out of the card at its own (from) amount', () => {
    const tx = makeCardTx({
      date: '2026-05-22T00:00:00.000Z',
      type: 'transfer',
      amount: 40,
      toAmount: 130,
      fromAccountId: CARD_ID,
      toAccountId: 'bank-1',
    });
    expect(creditDeltaForAccountTransaction(tx, CARD_ID)).toBe(40);
  });

  it('treats a legacy account-only transfer as a balance adjustment', () => {
    const tx = makeCardTx({
      date: '2026-05-22T00:00:00.000Z',
      type: 'transfer',
      amount: 15,
      accountId: CARD_ID,
    });
    expect(creditDeltaForAccountTransaction(tx, CARD_ID)).toBe(15);
  });

  it('ignores transactions on other accounts', () => {
    const tx = makeCardTx({
      date: '2026-05-20T00:00:00.000Z',
      type: 'expense',
      amount: 30,
      accountId: 'other',
    });
    expect(creditDeltaForAccountTransaction(tx, CARD_ID)).toBe(0);
  });
});

describe('computeCreditCycleSummary', () => {
  const account = { id: CARD_ID, creditStatementDay: 14 };
  const now = new Date(2026, 4, 20); // May 20, cycle started May 14

  it('reports the whole balance as outstanding when no statement day is set', () => {
    expect(
      computeCreditCycleSummary({ id: CARD_ID, creditStatementDay: null }, [], 250, now),
    ).toEqual({
      outstanding: 250,
      payable: 0,
    });
  });

  it('splits the balance into billed payable and current-cycle outstanding', () => {
    const txns = [
      makeCardTx({
        date: new Date(2026, 4, 10).toISOString(),
        type: 'expense',
        amount: 80,
        accountId: CARD_ID,
      }),
      makeCardTx({
        date: new Date(2026, 4, 16).toISOString(),
        type: 'expense',
        amount: 30,
        accountId: CARD_ID,
      }),
    ];
    expect(computeCreditCycleSummary(account, txns, 110, now)).toEqual({
      outstanding: 30,
      payable: 80,
    });
  });

  it('values a foreign-currency charge in the card currency', () => {
    // Without the account-currency value this would report the MYR 100 face
    // value as outstanding and wipe out the payable.
    const txns = [
      makeCardTx({
        date: new Date(2026, 4, 16).toISOString(),
        type: 'expense',
        amount: 100,
        currency: 'MYR',
        accountAmount: 29,
        accountId: CARD_ID,
      }),
    ];
    expect(computeCreditCycleSummary(account, txns, 67.36, now)).toEqual({
      outstanding: 29,
      payable: 38.36,
    });
  });

  it('settles the statement payable first when a payment lands mid-cycle', () => {
    const txns = [
      makeCardTx({
        date: new Date(2026, 4, 16).toISOString(),
        type: 'expense',
        amount: 30,
        accountId: CARD_ID,
      }),
      makeCardTx({
        date: new Date(2026, 4, 18).toISOString(),
        type: 'transfer',
        amount: 126.72,
        currency: 'MYR',
        toAmount: 38.36,
        fromAccountId: 'bank-1',
        toAccountId: CARD_ID,
      }),
    ];
    // Balance 30 left after the payment cleared the 38.36 statement.
    expect(computeCreditCycleSummary(account, txns, 30, now)).toEqual({
      outstanding: 30,
      payable: 0,
    });
  });

  it('never reports a negative payable when the card is overpaid', () => {
    expect(computeCreditCycleSummary(account, [], -20, now)).toEqual({
      outstanding: 0,
      payable: 0,
    });
  });
});
