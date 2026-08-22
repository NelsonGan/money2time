import {
  bucketReimbursements,
  buildRefundNote,
  countsTowardSpending,
  filterSpendingTransactions,
  isReimbursementLinked,
  NO_REIMBURSEMENT,
  sumReporting,
} from '~/features/reimbursements/lib/reimbursementMath';

function expense(overrides: Partial<Row> = {}): Row {
  return {
    id: 'tx',
    type: 'expense',
    date: '2026-08-01T00:00:00.000Z',
    amount: 100,
    reportingAmount: 100,
    ...NO_REIMBURSEMENT,
    deletedAt: null,
    ...overrides,
  };
}

interface Row {
  id: string;
  type: string;
  date: string;
  amount: number;
  reportingAmount: number | null;
  reimbursable: boolean;
  reimbursedAt: string | null;
  reimbursementAccountId: string | null;
  reimbursementTransactionId: string | null;
  reimbursementOfId: string | null;
  deletedAt?: string | null;
}

describe('isReimbursementLinked', () => {
  it('is false for an ordinary transaction', () => {
    expect(isReimbursementLinked(expense())).toBe(false);
  });

  it('is true for a flagged expense', () => {
    expect(isReimbursementLinked(expense({ reimbursable: true }))).toBe(true);
  });

  it('is true for the income row written for a refund', () => {
    expect(isReimbursementLinked(expense({ type: 'income', reimbursementOfId: 'a' }))).toBe(true);
  });
});

describe('countsTowardSpending', () => {
  it('counts everything while the setting is on', () => {
    expect(countsTowardSpending(expense({ reimbursable: true }), true)).toBe(true);
    expect(countsTowardSpending(expense({ reimbursementOfId: 'a' }), true)).toBe(true);
  });

  it('drops both halves of a reimbursement while the setting is off', () => {
    expect(countsTowardSpending(expense({ reimbursable: true }), false)).toBe(false);
    expect(countsTowardSpending(expense({ reimbursementOfId: 'a' }), false)).toBe(false);
  });

  it('leaves unrelated transactions alone either way', () => {
    expect(countsTowardSpending(expense(), true)).toBe(true);
    expect(countsTowardSpending(expense(), false)).toBe(true);
  });

  it('excludes a flagged expense before it has been paid back', () => {
    const pending = expense({ reimbursable: true, reimbursedAt: null });
    expect(countsTowardSpending(pending, false)).toBe(false);
  });
});

describe('filterSpendingTransactions', () => {
  const rows = [
    expense({ id: 'plain' }),
    expense({ id: 'flagged', reimbursable: true }),
    expense({ id: 'refund', type: 'income', reimbursementOfId: 'flagged' }),
  ];

  it('returns the very same array when the setting is on', () => {
    expect(filterSpendingTransactions(rows, true)).toBe(rows);
  });

  it('keeps only unrelated rows when the setting is off', () => {
    expect(filterSpendingTransactions(rows, false).map((row) => row.id)).toEqual(['plain']);
  });

  // The expense and its refund are equal and opposite, so dropping one without
  // the other would leave the period looking like a surplus.
  it('nets to zero either way', () => {
    const net = (setting: boolean) =>
      filterSpendingTransactions(rows, setting).reduce(
        (total, row) => total + (row.type === 'income' ? row.amount : -row.amount),
        0,
      );
    expect(net(true)).toBe(-100);
    expect(net(false)).toBe(-100);
  });
});

describe('bucketReimbursements', () => {
  it('splits pending from settled and ignores unflagged rows', () => {
    const { pending, settled } = bucketReimbursements([
      expense({ id: 'plain' }),
      expense({ id: 'waiting', reimbursable: true }),
      expense({ id: 'done', reimbursable: true, reimbursedAt: '2026-08-05T00:00:00.000Z' }),
    ]);
    expect(pending.map((row) => row.id)).toEqual(['waiting']);
    expect(settled.map((row) => row.id)).toEqual(['done']);
  });

  it('drops soft-deleted rows from both buckets', () => {
    const { pending, settled } = bucketReimbursements([
      expense({ id: 'gone', reimbursable: true, deletedAt: '2026-08-02T00:00:00.000Z' }),
    ]);
    expect(pending).toEqual([]);
    expect(settled).toEqual([]);
  });

  it('orders pending newest first and settled most-recently-paid first', () => {
    const { pending, settled } = bucketReimbursements([
      expense({ id: 'old', reimbursable: true, date: '2026-07-01T00:00:00.000Z' }),
      expense({ id: 'new', reimbursable: true, date: '2026-08-01T00:00:00.000Z' }),
      expense({ id: 'paid-first', reimbursable: true, reimbursedAt: '2026-08-01T00:00:00.000Z' }),
      expense({ id: 'paid-last', reimbursable: true, reimbursedAt: '2026-08-09T00:00:00.000Z' }),
    ]);
    expect(pending.map((row) => row.id)).toEqual(['new', 'old']);
    expect(settled.map((row) => row.id)).toEqual(['paid-last', 'paid-first']);
  });
});

describe('sumReporting', () => {
  it('prefers the frozen reporting amount over the entered one', () => {
    expect(sumReporting([{ amount: 40, reportingAmount: 92.5 }])).toBe(92.5);
  });

  it('falls back to the entered amount when there is no snapshot', () => {
    expect(sumReporting([{ amount: 40, reportingAmount: null }])).toBe(40);
  });
});

describe('buildRefundNote', () => {
  it('is the prefix alone when the expense had no note', () => {
    expect(buildRefundNote('Reimbursed', null)).toBe('Reimbursed');
    expect(buildRefundNote('Reimbursed', '   ')).toBe('Reimbursed');
  });

  it('appends the expense note', () => {
    expect(buildRefundNote('Reimbursed', 'Team lunch')).toBe('Reimbursed: Team lunch');
  });

  it('truncates a long note so the row stays readable', () => {
    const note = 'x'.repeat(60);
    const result = buildRefundNote('Reimbursed', note);
    expect(result.startsWith('Reimbursed: ')).toBe(true);
    expect(result.endsWith('..')).toBe(true);
    expect(result.length).toBeLessThan('Reimbursed: '.length + 45);
  });
});
