import {
  aggregateUnpaidSplitsByPerson,
  buildReceiptText,
  recentSplitPersonNames,
  UNNAMED_PERSON_KEY,
} from '~/features/transactions/lib/settleUp';
import type { TransactionSplit, TransactionWithRelations } from '~/types';

function makeSplit(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: overrides.id ?? 's1',
    transactionId: overrides.transactionId ?? 't1',
    personName: 'Sarah',
    amount: 10,
    isSelf: false,
    paybackAccountId: null,
    paidAt: null,
    paidTransactionId: null,
    sortOrder: 0,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeTx(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 't1',
    type: 'expense',
    amount: 100,
    currency: 'USD',
    reportingCurrency: 'USD',
    reportingAmount: 100,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    date: '2026-05-14',
    accountId: 'a1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'c1',
    note: null,
    receiptUri: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('aggregateUnpaidSplitsByPerson', () => {
  it('returns an empty summary when there are no splits', () => {
    const summary = aggregateUnpaidSplitsByPerson([makeTx({})], { reportingCurrency: 'USD' });
    expect(summary).toEqual({
      people: [],
      totalReporting: 0,
      personCount: 0,
      billCount: 0,
      reportingCurrency: 'USD',
    });
  });

  it('groups a person case-insensitively and sums across transactions', () => {
    const txs = [
      makeTx({
        id: 't1',
        date: '2026-05-14',
        splits: [makeSplit({ id: 's1', transactionId: 't1', personName: 'Sarah', amount: 32 })],
      }),
      makeTx({
        id: 't2',
        date: '2026-06-01',
        splits: [makeSplit({ id: 's2', transactionId: 't2', personName: 'sarah', amount: 12 })],
      }),
    ];
    const summary = aggregateUnpaidSplitsByPerson(txs, { reportingCurrency: 'USD' });
    expect(summary.personCount).toBe(1);
    expect(summary.billCount).toBe(2);
    expect(summary.totalReporting).toBe(44);
    const [sarah] = summary.people;
    expect(sarah.key).toBe('sarah');
    // Display name comes from the most recent bill ("sarah" on 2026-06-01).
    expect(sarah.name).toBe('sarah');
    expect(sarah.totalReporting).toBe(44);
    expect(sarah.oldestDate).toBe('2026-05-14');
    // Newest bill first.
    expect(sarah.bills.map((b) => b.splitId)).toEqual(['s2', 's1']);
  });

  it('ignores self splits and already-paid splits', () => {
    const tx = makeTx({
      splits: [
        makeSplit({ id: 's-self', isSelf: true, personName: 'Me', amount: 50 }),
        makeSplit({ id: 's-paid', personName: 'Marcus', amount: 20, paidAt: '2026-06-02' }),
        makeSplit({ id: 's-open', personName: 'Marcus', amount: 30 }),
      ],
    });
    const summary = aggregateUnpaidSplitsByPerson([tx], { reportingCurrency: 'USD' });
    expect(summary.personCount).toBe(1);
    expect(summary.people[0].name).toBe('Marcus');
    expect(summary.people[0].totalReporting).toBe(30);
    expect(summary.people[0].billCount).toBe(1);
  });

  it('collapses unnamed splits into one bucket that sorts last on ties', () => {
    const txs = [
      makeTx({
        id: 't1',
        splits: [makeSplit({ id: 's1', personName: null, amount: 40 })],
      }),
      makeTx({
        id: 't2',
        splits: [makeSplit({ id: 's2', personName: '   ', amount: 40 })],
      }),
      makeTx({
        id: 't3',
        splits: [makeSplit({ id: 's3', personName: 'Priya', amount: 40 })],
      }),
    ];
    const summary = aggregateUnpaidSplitsByPerson(txs, { reportingCurrency: 'USD' });
    expect(summary.personCount).toBe(2);
    const unnamed = summary.people.find((p) => p.key === UNNAMED_PERSON_KEY);
    expect(unnamed?.name).toBeNull();
    expect(unnamed?.billCount).toBe(2);
    // Equal totals (80 vs 40? no) — make them tie to assert ordering.
    // Priya=40, unnamed=80 so unnamed is first here by amount; ordering-on-tie
    // is covered separately below.
    expect(summary.people[0].key).toBe(UNNAMED_PERSON_KEY);
  });

  it('sinks the unnamed bucket below a named person when totals tie', () => {
    const txs = [
      makeTx({ id: 't1', splits: [makeSplit({ id: 's1', personName: null, amount: 25 })] }),
      makeTx({ id: 't2', splits: [makeSplit({ id: 's2', personName: 'Dana', amount: 25 })] }),
    ];
    const summary = aggregateUnpaidSplitsByPerson(txs, { reportingCurrency: 'USD' });
    expect(summary.people.map((p) => p.key)).toEqual(['dana', UNNAMED_PERSON_KEY]);
  });

  it('rolls a cross-currency tab up in the reporting currency via the frozen fxRate', () => {
    const txs = [
      // Native reporting-currency bill.
      makeTx({
        id: 't1',
        currency: 'USD',
        reportingCurrency: 'USD',
        fxRate: 1,
        splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 32 })],
      }),
      // Foreign bill: 80 SGD at a frozen 0.75 → 60 USD.
      makeTx({
        id: 't2',
        currency: 'SGD',
        reportingCurrency: 'USD',
        fxRate: 0.75,
        splits: [makeSplit({ id: 's2', personName: 'Sarah', amount: 80 })],
      }),
    ];
    const summary = aggregateUnpaidSplitsByPerson(txs, { reportingCurrency: 'USD' });
    const [sarah] = summary.people;
    expect(sarah.totalReporting).toBe(92); // 32 + 60
    expect(sarah.byCurrency).toEqual([
      { currency: 'SGD', amount: 80 },
      { currency: 'USD', amount: 32 },
    ]);
  });

  it('uses the live fallback rate only when no frozen snapshot is usable', () => {
    const tx = makeTx({
      currency: 'EUR',
      reportingCurrency: null,
      reportingAmount: null,
      fxRate: null,
      splits: [makeSplit({ id: 's1', personName: 'Luca', amount: 10 })],
    });
    const summary = aggregateUnpaidSplitsByPerson([tx], {
      reportingCurrency: 'USD',
      rateToReporting: (currency) => (currency === 'EUR' ? 1.1 : null),
    });
    expect(summary.people[0].totalReporting).toBe(11);
  });

  it('falls back to the native amount when no rate is available at all', () => {
    const tx = makeTx({
      currency: 'JPY',
      reportingCurrency: null,
      fxRate: null,
      splits: [makeSplit({ id: 's1', personName: 'Kenji', amount: 500 })],
    });
    const summary = aggregateUnpaidSplitsByPerson([tx], { reportingCurrency: 'USD' });
    expect(summary.people[0].totalReporting).toBe(500);
  });
});

describe('buildReceiptText', () => {
  const strings = {
    heading: 'Split summary',
    fromTo: 'Alex → Sarah',
    totalLabel: 'You owe',
    payLine: null,
    qrNote: null,
    footer: 'Sent from money2time',
  };
  const formatMoney = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

  it('labels bills by note, then category, then date', () => {
    const [sarah] = aggregateUnpaidSplitsByPerson(
      [
        makeTx({
          id: 't1',
          date: '2026-06-09',
          note: 'Concert tickets',
          splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 80 })],
        }),
        makeTx({
          id: 't2',
          date: '2026-05-14',
          note: null,
          categoryName: 'Dining',
          splits: [makeSplit({ id: 's2', personName: 'Sarah', amount: 32 })],
        }),
      ],
      { reportingCurrency: 'USD' },
    ).people;

    const text = buildReceiptText(sarah, { strings, formatMoney });
    expect(text).toContain('• Concert tickets: USD 80.00');
    expect(text).toContain('• Dining: USD 32.00');
    expect(text).toContain('You owe: USD 112.00');
    expect(text.startsWith('Split summary\nAlex → Sarah')).toBe(true);
    expect(text.endsWith('Sent from money2time')).toBe(true);
  });

  it('joins multi-currency totals and includes the pay line + QR note when present', () => {
    const [sarah] = aggregateUnpaidSplitsByPerson(
      [
        makeTx({
          id: 't1',
          currency: 'USD',
          fxRate: 1,
          reportingCurrency: 'USD',
          splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 32 })],
        }),
        makeTx({
          id: 't2',
          currency: 'SGD',
          fxRate: 0.75,
          reportingCurrency: 'USD',
          splits: [makeSplit({ id: 's2', personName: 'Sarah', amount: 80 })],
        }),
      ],
      { reportingCurrency: 'USD' },
    ).people;

    const text = buildReceiptText(sarah, {
      strings: {
        ...strings,
        payLine: 'Pay me back: PayNow · +65 ••4821',
        qrNote: 'Scan the QR I attached to pay me back.',
      },
      formatMoney,
    });
    expect(text).toContain('You owe: SGD 80.00 + USD 32.00');
    expect(text).toContain('Pay me back: PayNow · +65 ••4821');
    expect(text).toContain('Scan the QR I attached to pay me back.');
  });

  it('carries no long dashes in the rendered receipt', () => {
    const [sarah] = aggregateUnpaidSplitsByPerson(
      [
        makeTx({
          id: 't1',
          note: 'Dinner',
          splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 32 })],
        }),
      ],
      { reportingCurrency: 'USD' },
    ).people;
    const text = buildReceiptText(sarah, { strings, formatMoney });
    expect(text).not.toMatch(/[—–─]/);
  });
});

describe('aggregateUnpaidSplitsByPerson — payback account', () => {
  it("carries the split's payback account, falling back to the parent's", () => {
    const summary = aggregateUnpaidSplitsByPerson(
      [
        makeTx({
          id: 't1',
          accountId: 'acct-parent',
          splits: [
            makeSplit({ id: 's1', personName: 'Sarah', amount: 10, paybackAccountId: 'acct-cash' }),
          ],
        }),
        makeTx({
          id: 't2',
          accountId: 'acct-parent',
          splits: [
            makeSplit({ id: 's2', personName: 'Sarah', amount: 20, paybackAccountId: null }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    const bills = summary.people[0].bills;
    expect(bills.find((b) => b.splitId === 's1')?.paybackAccountId).toBe('acct-cash');
    expect(bills.find((b) => b.splitId === 's2')?.paybackAccountId).toBe('acct-parent');
  });
});

describe('recentSplitPersonNames', () => {
  it('returns distinct names most-recently-used first, skipping self and blanks', () => {
    const names = recentSplitPersonNames([
      makeTx({
        id: 't1',
        date: '2026-05-01',
        splits: [makeSplit({ id: 's1', personName: 'Marcus', amount: 10 })],
      }),
      makeTx({
        id: 't2',
        date: '2026-06-10',
        splits: [
          makeSplit({ id: 's2', personName: 'Sarah', amount: 10 }),
          makeSplit({ id: 's3', personName: 'Me', isSelf: true, amount: 10 }),
          makeSplit({ id: 's4', personName: '   ', amount: 10 }),
        ],
      }),
      makeTx({
        id: 't3',
        date: '2026-06-20',
        // Duplicate of Marcus, more recent → bumps Marcus to the front.
        splits: [makeSplit({ id: 's5', personName: 'marcus', amount: 10 })],
      }),
    ]);
    expect(names).toEqual(['marcus', 'Sarah']);
  });

  it('returns an empty list when there are no named splits', () => {
    expect(recentSplitPersonNames([makeTx({})])).toEqual([]);
  });
});
