import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import { UNNAMED_PERSON_KEY } from '~/features/transactions/lib/debtParty';
import {
  aggregateSettleUpByPerson,
  aggregateSettleUpByTransaction,
  buildPaybackTransferNote,
  buildReceiptText,
  countUnpaidDebtors,
  countUnpaidSplitBills,
  personBalanceState,
  personSettlementRows,
  receiptShareFileName,
  recentSplitPersonNames,
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
    partOfSplitId: null,
    isPayer: false,
    shareAmount: null,
    memberId: null,
    albumMemberId: null,
    settlementId: null,
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
    dayOrder: null,
    instalmentRuleId: null,
    instalmentNumber: null,
    createdBy: null,
    memberId: null,
    albumGroupId: null,
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
    details: null,
    receiptUri: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    countsAsExpense: false,
    feeOfId: null,
    ...NO_REIMBURSEMENT,
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('aggregateSettleUpByPerson', () => {
  it('keeps paid history beside unpaid shares without adding it to what is owed', () => {
    const summary = aggregateSettleUpByPerson(
      [
        makeTx({
          id: 'mixed',
          date: '2026-06-01',
          splits: [
            makeSplit({ id: 'open', personName: 'Sarah', amount: 30 }),
            makeSplit({ id: 'paid', personName: 'sarah', amount: 20, paidAt: '2026-06-05' }),
            makeSplit({ id: 'self', personName: 'Me', amount: 50, isSelf: true }),
          ],
        }),
        makeTx({
          id: 'settled',
          date: '2026-05-01',
          splits: [
            makeSplit({ id: 'old-paid', personName: 'Dana', amount: 10, paidAt: '2026-05-03' }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );

    expect(summary.totalReporting).toBe(30);
    expect(summary.personCount).toBe(2);
    expect(summary.billCount).toBe(1);
    expect(summary.people.map((person) => person.key)).toEqual(['sarah', 'dana']);
    expect(summary.people[0]).toMatchObject({
      totalReporting: 30,
      paidReporting: 20,
      unpaidBillCount: 1,
      billCount: 1,
    });
    expect(summary.people[0].bills.map((bill) => [bill.splitId, bill.paidAt])).toEqual([
      ['open', null],
      ['paid', '2026-06-05'],
    ]);
    expect(summary.people[1]).toMatchObject({
      totalReporting: 0,
      paidReporting: 10,
      unpaidBillCount: 0,
    });
    expect(
      countUnpaidDebtors([
        makeTx({ splits: [makeSplit({ personName: 'Dana', paidAt: '2026-05-03' })] }),
      ]),
    ).toBe(0);
  });

  it('orders paid-only people by their latest payback date', () => {
    const summary = aggregateSettleUpByPerson(
      [
        makeTx({
          id: 'old',
          splits: [makeSplit({ id: 'old-paid', personName: 'Old', paidAt: '2026-06-01' })],
        }),
        makeTx({
          id: 'new',
          splits: [makeSplit({ id: 'new-paid', personName: 'New', paidAt: '2026-06-10' })],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.people.map((person) => person.key)).toEqual(['new', 'old']);
  });

  it('uses the oldest unpaid bill date even when paid history is older', () => {
    const summary = aggregateSettleUpByPerson(
      [
        makeTx({
          id: 'paid',
          date: '2026-01-01',
          splits: [makeSplit({ id: 'paid-share', paidAt: '2026-01-05' })],
        }),
        makeTx({ id: 'open', date: '2026-06-01', splits: [makeSplit({ id: 'open-share' })] }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.people[0].oldestDate).toBe('2026-06-01');
  });
  it('returns an empty summary when there are no splits', () => {
    const summary = aggregateSettleUpByPerson([makeTx({})], { reportingCurrency: 'USD' });
    expect(summary).toEqual({
      people: [],
      totalReporting: 0,
      owedReporting: 0,
      netReporting: 0,
      owedToYouReporting: 0,
      youOweReporting: 0,
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
    const summary = aggregateSettleUpByPerson(txs, { reportingCurrency: 'USD' });
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

  it('keeps paid shares out of outstanding totals', () => {
    const tx = makeTx({
      splits: [
        makeSplit({ id: 's-self', isSelf: true, personName: 'Me', amount: 50 }),
        makeSplit({ id: 's-paid', personName: 'Marcus', amount: 20, paidAt: '2026-06-02' }),
        makeSplit({ id: 's-open', personName: 'Marcus', amount: 30 }),
      ],
    });
    const summary = aggregateSettleUpByPerson([tx], { reportingCurrency: 'USD' });
    expect(summary.personCount).toBe(1);
    expect(summary.people[0].name).toBe('Marcus');
    expect(summary.people[0].totalReporting).toBe(30);
    expect(summary.people[0].unpaidBillCount).toBe(1);
    // Two rows of one bill: a share paid in part is still one bill.
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
    const summary = aggregateSettleUpByPerson(txs, { reportingCurrency: 'USD' });
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
    const summary = aggregateSettleUpByPerson(txs, { reportingCurrency: 'USD' });
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
    const summary = aggregateSettleUpByPerson(txs, { reportingCurrency: 'USD' });
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
    const summary = aggregateSettleUpByPerson([tx], {
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
    const summary = aggregateSettleUpByPerson([tx], { reportingCurrency: 'USD' });
    expect(summary.people[0].totalReporting).toBe(500);
  });
});

describe('buildReceiptText', () => {
  it('renders title, bulleted lines and a total', () => {
    const text = buildReceiptText({
      title: 'Sarah',
      lines: [
        { label: 'Concert tickets', amount: 'USD 80.00' },
        { label: 'Dining', amount: 'USD 32.00' },
      ],
      totalLabel: 'You owe',
      totalText: 'USD 112.00',
    });
    expect(text).toContain('• Concert tickets: USD 80.00');
    expect(text).toContain('• Dining: USD 32.00');
    expect(text).toContain('You owe: USD 112.00');
    expect(text.startsWith('Sarah\n')).toBe(true);
  });

  it('adds a subtitle and QR note when provided', () => {
    const text = buildReceiptText({
      title: 'Dinner',
      subtitle: '9 Jun 2026',
      lines: [{ label: 'Sarah', amount: 'SGD 80.00' }],
      totalLabel: 'You owe',
      totalText: 'SGD 80.00',
      qrNote: 'Scan the QR I attached to pay me back.',
    });
    expect(text.startsWith('Dinner\n9 Jun 2026\n')).toBe(true);
    expect(text).toContain('Scan the QR I attached to pay me back.');
  });

  it('carries no long dashes in the rendered receipt', () => {
    const text = buildReceiptText({
      title: 'Sarah',
      lines: [{ label: 'Dinner', amount: 'USD 32.00' }],
      totalLabel: 'You owe',
      totalText: 'USD 32.00',
    });
    expect(text).not.toMatch(/[—–─]/);
  });
});

describe('aggregateSettleUpByTransaction', () => {
  it('rolls a share paid in parts up, and keeps its place among equal shares', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 'flight',
          amount: 2700,
          splits: [
            makeSplit({ id: 'aisha', personName: 'Aisha', amount: 700 }),
            makeSplit({
              id: 'aisha-part',
              personName: 'Aisha',
              amount: 300,
              paidAt: '2026-11-02',
              partOfSplitId: 'aisha',
            }),
            makeSplit({ id: 'ben', personName: 'Ben', amount: 1000 }),
            makeSplit({ id: 'chloe', personName: 'Chloe', amount: 1000 }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    const bill = summary.transactions[0]!;
    expect(bill.totalNative).toBe(2700);
    expect(bill.paidNative).toBe(300);
    expect(bill.unpaidSplitCount).toBe(3);
    expect(bill.splits.map((s) => [s.splitId, s.shareTotal, s.sharePaid, s.shareKey])).toEqual([
      ['aisha', 1000, 300, 'aisha'],
      ['ben', 1000, 0, 'ben'],
      ['chloe', 1000, 0, 'chloe'],
      ['aisha-part', 1000, 300, 'aisha'],
    ]);
  });

  it('gives each person their share paid in parts', () => {
    const summary = aggregateSettleUpByPerson(
      [
        makeTx({
          splits: [
            makeSplit({ id: 'a', personName: 'Aisha', amount: 700 }),
            makeSplit({
              id: 'p',
              personName: 'Aisha',
              amount: 300,
              paidAt: '2026-11-02',
              partOfSplitId: 'a',
            }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    const aisha = summary.people[0]!;
    expect(aisha.totalReporting).toBe(700);
    expect(aisha.paidReporting).toBe(300);
    expect(aisha.unpaidBillCount).toBe(1);
    expect(aisha.bills.map((b) => [b.splitId, b.shareTotal, b.sharePaid, b.shareKey])).toEqual([
      ['a', 1000, 300, 'a'],
      ['p', 1000, 300, 'a'],
    ]);
  });

  it('shows mixed and fully paid bills while keeping outstanding totals unpaid only', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 'mixed',
          date: '2026-06-01',
          splits: [
            makeSplit({ id: 'open', amount: 30 }),
            makeSplit({ id: 'paid', amount: 20, paidAt: '2026-06-05' }),
          ],
        }),
        makeTx({
          id: 'settled',
          date: '2026-05-01',
          splits: [makeSplit({ id: 'old-paid', amount: 10, paidAt: '2026-05-03' })],
        }),
      ],
      { reportingCurrency: 'USD' },
    );

    expect(summary.totalReporting).toBe(30);
    expect(summary.transactionCount).toBe(2);
    expect(summary.splitCount).toBe(1);
    expect(summary.transactions.map((bill) => bill.transactionId)).toEqual(['mixed', 'settled']);
    expect(summary.transactions[0]).toMatchObject({
      totalNative: 30,
      paidNative: 20,
      latestPaidAt: '2026-06-05',
      unpaidSplitCount: 1,
      splitCount: 2,
    });
    expect(summary.transactions[0].splits.map((split) => split.paidAt)).toEqual([
      null,
      '2026-06-05',
    ]);
    expect(summary.transactions[1]).toMatchObject({
      totalNative: 0,
      paidNative: 10,
      latestPaidAt: '2026-05-03',
      unpaidSplitCount: 0,
    });
    expect(countUnpaidSplitBills([makeTx({ splits: [makeSplit({ paidAt: '2026-05-03' })] })])).toBe(
      0,
    );
  });

  it('sorts paid-only bills after outstanding bills even when repayment was more recent', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({ id: 'open', date: '2026-01-01', splits: [makeSplit({ id: 'open-share' })] }),
        makeTx({
          id: 'paid',
          date: '2026-01-02',
          splits: [makeSplit({ id: 'paid-share', paidAt: '2026-06-10' })],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.transactions.map((bill) => bill.transactionId)).toEqual(['open', 'paid']);
  });

  it('orders fully paid bills by their latest payment rather than the original bill date', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 'older-payment',
          date: '2026-06-01',
          splits: [makeSplit({ id: 'older-share', paidAt: '2026-06-02' })],
        }),
        makeTx({
          id: 'newer-payment',
          date: '2026-01-01',
          splits: [
            makeSplit({ id: 'first-share', paidAt: '2026-06-03' }),
            makeSplit({ id: 'last-share', paidAt: '2026-06-10' }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.transactions.map((bill) => bill.transactionId)).toEqual([
      'newer-payment',
      'older-payment',
    ]);
    expect(summary.transactions[0].latestPaidAt).toBe('2026-06-10');
  });

  it('orders paid shares within a bill by payback date', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 'paid',
          splits: [
            makeSplit({ id: 'old', paidAt: '2026-06-01' }),
            makeSplit({ id: 'new', paidAt: '2026-06-10' }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.transactions[0].splits.map((split) => split.splitId)).toEqual(['new', 'old']);
  });
  it('returns an empty summary when there are no shares', () => {
    const summary = aggregateSettleUpByTransaction([makeTx({})], { reportingCurrency: 'USD' });
    expect(summary).toEqual({
      transactions: [],
      totalReporting: 0,
      owedReporting: 0,
      transactionCount: 0,
      splitCount: 0,
      reportingCurrency: 'USD',
    });
  });

  it('groups every unpaid share under its bill, largest share first', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 't1',
          date: '2026-06-09',
          note: 'Dinner',
          splits: [
            makeSplit({ id: 's1', transactionId: 't1', personName: 'Sarah', amount: 20 }),
            makeSplit({ id: 's2', transactionId: 't1', personName: 'Marcus', amount: 45 }),
            makeSplit({
              id: 's-self',
              transactionId: 't1',
              personName: 'Me',
              isSelf: true,
              amount: 35,
            }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.transactionCount).toBe(1);
    expect(summary.splitCount).toBe(2);
    expect(summary.totalReporting).toBe(65);
    const [bill] = summary.transactions;
    expect(bill.totalNative).toBe(65);
    expect(bill.splits.map((s) => s.personName)).toEqual(['Marcus', 'Sarah']);
  });

  it('keeps fully-paid bills after outstanding bills', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 't-old',
          date: '2026-05-01',
          splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 10 })],
        }),
        makeTx({
          id: 't-paid',
          date: '2026-06-01',
          splits: [makeSplit({ id: 's2', personName: 'Marcus', amount: 10, paidAt: '2026-06-02' })],
        }),
        makeTx({
          id: 't-new',
          date: '2026-06-10',
          splits: [makeSplit({ id: 's3', personName: 'Priya', amount: 10 })],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.transactions.map((t) => t.transactionId)).toEqual(['t-new', 't-old', 't-paid']);
  });

  it('converts a foreign bill via the frozen fxRate', () => {
    const summary = aggregateSettleUpByTransaction(
      [
        makeTx({
          id: 't1',
          currency: 'SGD',
          reportingCurrency: 'USD',
          fxRate: 0.75,
          splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 80 })],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    const [bill] = summary.transactions;
    expect(bill.totalNative).toBe(80);
    expect(bill.totalReporting).toBe(60);
    expect(bill.splits[0].reportingAmount).toBe(60);
  });
});

describe('aggregateSettleUpByPerson — payback account', () => {
  it("carries the split's payback account, falling back to the parent's", () => {
    const summary = aggregateSettleUpByPerson(
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

  it('still suggests names from splits that were marked paid', () => {
    const names = recentSplitPersonNames([
      makeTx({
        id: 't1',
        date: '2026-06-01',
        splits: [
          makeSplit({ id: 's1', personName: 'Alice', amount: 20, paidAt: '2026-06-05T00:00:00Z' }),
        ],
      }),
    ]);
    expect(names).toEqual(['Alice']);
  });
});

describe('countUnpaidDebtors', () => {
  it('returns 0 when there are no unpaid, non-self splits', () => {
    expect(countUnpaidDebtors([])).toBe(0);
    expect(
      countUnpaidDebtors([makeTx({ splits: [makeSplit({ isSelf: true, amount: 10 })] })]),
    ).toBe(0);
  });

  it('counts distinct people case-insensitively and folds the unnamed bucket into one', () => {
    const txs = [
      makeTx({ id: 't1', splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 10 })] }),
      makeTx({ id: 't2', splits: [makeSplit({ id: 's2', personName: 'sarah', amount: 5 })] }),
      makeTx({ id: 't3', splits: [makeSplit({ id: 's3', personName: 'Dana', amount: 5 })] }),
      makeTx({ id: 't4', splits: [makeSplit({ id: 's4', personName: null, amount: 5 })] }),
      makeTx({ id: 't5', splits: [makeSplit({ id: 's5', personName: '  ', amount: 5 })] }),
    ];
    // sarah (deduped) + Dana + unnamed bucket = 3
    expect(countUnpaidDebtors(txs)).toBe(3);
  });

  it('ignores self, paid, and non-positive splits', () => {
    const tx = makeTx({
      splits: [
        makeSplit({ id: 's1', personName: 'Me', isSelf: true, amount: 40 }),
        makeSplit({ id: 's2', personName: 'Paid', paidAt: '2026-05-15T00:00:00.000Z', amount: 20 }),
        makeSplit({ id: 's3', personName: 'Zero', amount: 0 }),
        makeSplit({ id: 's4', personName: 'Owing', amount: 20 }),
      ],
    });
    expect(countUnpaidDebtors([tx])).toBe(1);
  });

  it('matches the number of people with an outstanding share', () => {
    const txs = [
      makeTx({ id: 't1', splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 10 })] }),
      makeTx({ id: 't2', splits: [makeSplit({ id: 's2', personName: 'Dana', amount: 5 })] }),
      makeTx({ id: 't3', splits: [makeSplit({ id: 's3', personName: null, amount: 5 })] }),
      makeTx({
        id: 't4',
        splits: [makeSplit({ id: 's4', personName: 'Paid', paidAt: '2026-05-15' })],
      }),
    ];
    const summary = aggregateSettleUpByPerson(txs, { reportingCurrency: 'USD' });
    expect(countUnpaidDebtors(txs)).toBe(
      summary.people.filter((p) => p.unpaidBillCount > 0).length,
    );
  });
});

describe('countUnpaidSplitBills', () => {
  it('returns 0 when no transaction has an unpaid, non-self split', () => {
    expect(countUnpaidSplitBills([])).toBe(0);
    expect(
      countUnpaidSplitBills([makeTx({ splits: [makeSplit({ isSelf: true, amount: 10 })] })]),
    ).toBe(0);
  });

  it('leaves out a shared album’s bills: they count toward no free limit', () => {
    const open = [makeSplit({ id: 's1', personName: 'Sarah', amount: 10 })];
    expect(
      countUnpaidSplitBills([
        makeTx({ id: 't1', splits: open, albumGroupId: 'bali' }),
        makeTx({ id: 't2', splits: open }),
      ]),
    ).toBe(1);
  });

  it('counts one per transaction regardless of how many people owe on it', () => {
    const txs = [
      makeTx({
        id: 't1',
        splits: [
          makeSplit({ id: 's1', personName: 'Sarah', amount: 10 }),
          makeSplit({ id: 's2', personName: 'Dana', amount: 10 }),
        ],
      }),
      makeTx({ id: 't2', splits: [makeSplit({ id: 's3', personName: 'Mia', amount: 5 })] }),
    ];
    expect(countUnpaidSplitBills(txs)).toBe(2);
  });

  it('ignores transactions whose splits are all self, paid, or non-positive', () => {
    const txs = [
      makeTx({
        id: 't1',
        splits: [
          makeSplit({ id: 's1', personName: 'Me', isSelf: true, amount: 40 }),
          makeSplit({
            id: 's2',
            personName: 'Paid',
            paidAt: '2026-05-15T00:00:00.000Z',
            amount: 20,
          }),
          makeSplit({ id: 's3', personName: 'Zero', amount: 0 }),
        ],
      }),
      makeTx({ id: 't2', splits: [makeSplit({ id: 's4', personName: 'Owing', amount: 20 })] }),
    ];
    expect(countUnpaidSplitBills(txs)).toBe(1);
  });

  it('matches the number of bills with an outstanding share', () => {
    const txs = [
      makeTx({ id: 't1', splits: [makeSplit({ id: 's1', personName: 'Sarah', amount: 10 })] }),
      makeTx({ id: 't2', splits: [makeSplit({ id: 's2', personName: 'Dana', amount: 5 })] }),
      makeTx({ id: 't3', splits: [makeSplit({ id: 's3', isSelf: true, amount: 5 })] }),
      makeTx({ id: 't4', splits: [makeSplit({ id: 's4', paidAt: '2026-05-15' })] }),
    ];
    const summary = aggregateSettleUpByTransaction(txs, { reportingCurrency: 'USD' });
    expect(countUnpaidSplitBills(txs)).toBe(
      summary.transactions.filter((bill) => bill.unpaidSplitCount > 0).length,
    );
  });
});

describe('buildPaybackTransferNote', () => {
  it('combines a short name and the bill note', () => {
    expect(buildPaybackTransferNote('Sarah', 'Restaurant Nasi')).toBe('Sarah: Restaurant Nasi');
  });

  it('keeps an exactly-8-character name untruncated', () => {
    expect(buildPaybackTransferNote('Jonathan', 'Lunch')).toBe('Jonathan: Lunch');
  });

  it('truncates a name longer than 8 characters to 7 characters plus ".."', () => {
    expect(buildPaybackTransferNote('Jonathan Chua', 'Restaurant Nasi')).toBe(
      'Jonatha..: Restaurant Nasi',
    );
  });

  it('trims name and note before combining', () => {
    expect(buildPaybackTransferNote('  Dana ', '  Coffee  ')).toBe('Dana: Coffee');
  });

  it('falls back to the name alone when the bill has no note', () => {
    expect(buildPaybackTransferNote('Jonathan Chua', null)).toBe('Jonatha..');
    expect(buildPaybackTransferNote('Dana', '   ')).toBe('Dana');
  });

  it('falls back to the note alone when the split has no person name', () => {
    expect(buildPaybackTransferNote(null, 'Restaurant Nasi')).toBe('Restaurant Nasi');
    expect(buildPaybackTransferNote('  ', 'Restaurant Nasi')).toBe('Restaurant Nasi');
  });

  it('returns null when neither a name nor a note exists', () => {
    expect(buildPaybackTransferNote(null, null)).toBeNull();
    expect(buildPaybackTransferNote('', '')).toBeNull();
  });
});

describe('receiptShareFileName', () => {
  it('gives each share its own file so a cached image is never reused', () => {
    const first = receiptShareFileName('Person A', 1000);
    const second = receiptShareFileName('Person B', 1000);
    const again = receiptShareFileName('Person A', 2000);
    expect(new Set([first, second, again]).size).toBe(3);
  });

  it('names the file after the receipt title', () => {
    expect(receiptShareFileName('Sarah Tan', 1700000000000)).toBe(
      'settle-up-receipt-sarah-tan-1700000000000.png',
    );
  });

  it('drops characters that are unsafe in a file name', () => {
    expect(receiptShareFileName(" Dinner @ Joe's / Bar ", 5)).toBe(
      'settle-up-receipt-dinner-joe-s-bar-5.png',
    );
  });

  it('folds accents to plain letters', () => {
    expect(receiptShareFileName('José Müller', 3)).toBe('settle-up-receipt-jose-muller-3.png');
  });

  it('falls back to the timestamp alone when nothing usable is left', () => {
    expect(receiptShareFileName('陈伟', 7)).toBe('settle-up-receipt-7.png');
    expect(receiptShareFileName('', 7)).toBe('settle-up-receipt-7.png');
  });
});

/**
 * A trip with Aisha and Ben. The user paid the hotel (RM600, each friend owes
 * RM200); Aisha paid dinner (RM90, the user's share RM30, Ben's RM30).
 */
function tripBills(overrides: { dinnerPaidAt?: string | null } = {}): TransactionWithRelations[] {
  return [
    makeTx({
      id: 'hotel',
      amount: 600,
      reportingAmount: 600,
      date: '2026-11-05',
      note: 'Hotel',
      splits: [
        makeSplit({ id: 'hotel-me', transactionId: 'hotel', isSelf: true, amount: 200 }),
        makeSplit({ id: 'hotel-aisha', transactionId: 'hotel', personName: 'Aisha', amount: 200 }),
        makeSplit({ id: 'hotel-ben', transactionId: 'hotel', personName: 'Ben', amount: 200 }),
      ],
    }),
    makeTx({
      id: 'dinner',
      amount: 30,
      reportingAmount: 30,
      accountId: null,
      date: '2026-11-06',
      note: 'Dinner',
      splits: [
        makeSplit({ id: 'dinner-me', transactionId: 'dinner', isSelf: true, amount: 30 }),
        makeSplit({
          id: 'dinner-aisha',
          transactionId: 'dinner',
          personName: 'aisha',
          amount: 0,
          isPayer: true,
          shareAmount: 30,
          paidAt: overrides.dinnerPaidAt ?? null,
          paybackAccountId: overrides.dinnerPaidAt ? 'maybank' : null,
        }),
        makeSplit({
          id: 'dinner-ben',
          transactionId: 'dinner',
          personName: 'Ben',
          amount: 0,
          shareAmount: 30,
        }),
      ],
    }),
  ];
}

describe('balances in both directions', () => {
  it('nets what a person owes against what the user owes them', () => {
    const summary = aggregateSettleUpByPerson(tripBills(), { reportingCurrency: 'USD' });
    const aisha = summary.people.find((person) => person.key === 'aisha')!;
    expect(aisha).toMatchObject({
      totalReporting: 200,
      owedReporting: 30,
      netReporting: 170,
      unpaidBillCount: 2,
      youOweCount: 1,
      byCurrency: [{ currency: 'USD', amount: 200 }],
      owedByCurrency: [{ currency: 'USD', amount: 30 }],
      netByCurrency: [{ currency: 'USD', amount: 170 }],
    });
    expect(aisha.bills.map((bill) => [bill.transactionId, bill.direction, bill.amount])).toEqual([
      ['dinner', 'you_owe', 30],
      ['hotel', 'owes_you', 200],
    ]);
    // The debt acts on the payer's row, which is what gets marked paid.
    expect(aisha.bills[0]!.splitId).toBe('dinner-aisha');
  });

  it("does not count the other friends on a friend's bill as owing the user", () => {
    const summary = aggregateSettleUpByPerson(tripBills(), { reportingCurrency: 'USD' });
    const ben = summary.people.find((person) => person.key === 'ben')!;
    // Ben owes the user for the hotel only; his dinner share is Aisha's to collect.
    expect(ben.totalReporting).toBe(200);
    expect(ben.bills).toHaveLength(1);
  });

  it('totals the gross amounts and the per-person nets', () => {
    const summary = aggregateSettleUpByPerson(tripBills(), { reportingCurrency: 'USD' });
    expect(summary).toMatchObject({
      totalReporting: 400,
      owedReporting: 30,
      netReporting: 370,
      owedToYouReporting: 370,
      youOweReporting: 0,
      billCount: 3,
    });
  });

  it('puts a person the user owes on balance under what the user owes', () => {
    const summary = aggregateSettleUpByPerson(
      tripBills().filter((tx) => tx.id === 'dinner'),
      { reportingCurrency: 'USD' },
    );
    expect(summary.people).toHaveLength(1);
    expect(summary.people[0]).toMatchObject({ key: 'aisha', netReporting: -30 });
    expect(summary).toMatchObject({
      totalReporting: 0,
      owedReporting: 30,
      netReporting: -30,
      owedToYouReporting: 0,
      youOweReporting: 30,
    });
  });

  it('moves a debt the user paid back to history', () => {
    const summary = aggregateSettleUpByPerson(
      tripBills({ dinnerPaidAt: '2026-11-12T09:00:00.000Z' }),
      { reportingCurrency: 'USD' },
    );
    const aisha = summary.people.find((person) => person.key === 'aisha')!;
    expect(aisha).toMatchObject({
      owedReporting: 0,
      owedPaidReporting: 30,
      netReporting: 200,
      youOweCount: 0,
      unpaidBillCount: 1,
    });
    const dinner = aisha.bills.find((bill) => bill.transactionId === 'dinner')!;
    expect(dinner).toMatchObject({
      paidAt: '2026-11-12T09:00:00.000Z',
      paybackAccountId: 'maybank',
      sharePaid: 30,
    });
  });

  it('sorts open balances by size either way, settled people last', () => {
    const summary = aggregateSettleUpByPerson(
      [
        ...tripBills(),
        makeTx({
          id: 'taxi',
          amount: 250,
          accountId: null,
          splits: [
            makeSplit({ id: 'taxi-me', transactionId: 'taxi', isSelf: true, amount: 250 }),
            makeSplit({
              id: 'taxi-cal',
              transactionId: 'taxi',
              personName: 'Cal',
              amount: 0,
              isPayer: true,
              shareAmount: 250,
            }),
          ],
        }),
        makeTx({
          id: 'old',
          splits: [
            makeSplit({
              id: 'old-dan',
              transactionId: 'old',
              personName: 'Dan',
              amount: 900,
              paidAt: '2026-10-01T00:00:00.000Z',
            }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.people.map((person) => person.key)).toEqual(['cal', 'ben', 'aisha', 'dan']);
  });

  it('keeps currencies apart in the net and drops the ones that cancel out', () => {
    const summary = aggregateSettleUpByPerson(
      [
        makeTx({
          id: 'sgd-in',
          currency: 'SGD',
          reportingCurrency: 'USD',
          fxRate: 0.75,
          splits: [
            makeSplit({ id: 'a', transactionId: 'sgd-in', personName: 'Aisha', amount: 40 }),
          ],
        }),
        makeTx({
          id: 'sgd-out',
          currency: 'SGD',
          reportingCurrency: 'USD',
          fxRate: 0.75,
          amount: 40,
          splits: [
            makeSplit({ id: 'me', transactionId: 'sgd-out', isSelf: true, amount: 40 }),
            makeSplit({
              id: 'b',
              transactionId: 'sgd-out',
              personName: 'Aisha',
              amount: 0,
              isPayer: true,
              shareAmount: 40,
            }),
          ],
        }),
        makeTx({
          id: 'usd-out',
          amount: 12,
          splits: [
            makeSplit({ id: 'me2', transactionId: 'usd-out', isSelf: true, amount: 12 }),
            makeSplit({
              id: 'c',
              transactionId: 'usd-out',
              personName: 'Aisha',
              amount: 0,
              isPayer: true,
              shareAmount: 12,
            }),
          ],
        }),
      ],
      { reportingCurrency: 'USD' },
    );
    expect(summary.people[0]).toMatchObject({
      netReporting: -12,
      netByCurrency: [{ currency: 'USD', amount: -12 }],
    });
  });

  it('lists a bill a friend paid as the one share the user owes, with everyone else beside it', () => {
    const summary = aggregateSettleUpByTransaction(tripBills(), { reportingCurrency: 'USD' });
    const dinner = summary.transactions.find((bill) => bill.transactionId === 'dinner')!;
    expect(dinner).toMatchObject({
      paidBy: { name: 'aisha' },
      billTotalNative: 90,
      totalNative: 30,
      unpaidSplitCount: 1,
      participants: [
        { splitId: 'dinner-aisha', personName: 'aisha', amount: 30, isPayer: true },
        { splitId: 'dinner-ben', personName: 'Ben', amount: 30, isPayer: false },
      ],
    });
    expect(dinner.splits).toEqual([
      expect.objectContaining({ splitId: 'dinner-aisha', direction: 'you_owe', amount: 30 }),
    ]);
    const hotel = summary.transactions.find((bill) => bill.transactionId === 'hotel')!;
    expect(hotel).toMatchObject({ paidBy: null, billTotalNative: null, participants: [] });
    expect(summary).toMatchObject({ totalReporting: 400, owedReporting: 30, splitCount: 3 });
  });

  it('counts a friend the user owes among the open balances, and their bill as unsettled', () => {
    const dinnerOnly = tripBills().filter((tx) => tx.id === 'dinner');
    expect(countUnpaidDebtors(dinnerOnly)).toBe(1);
    expect(countUnpaidSplitBills(dinnerOnly)).toBe(1);
    expect(countUnpaidDebtors(tripBills())).toBe(2);
    const paid = tripBills({ dinnerPaidAt: '2026-11-12T09:00:00.000Z' }).filter(
      (tx) => tx.id === 'dinner',
    );
    expect(countUnpaidDebtors(paid)).toBe(0);
    expect(countUnpaidSplitBills(paid)).toBe(0);
  });

  it('collects everything open with a person for a one-tap settle up', () => {
    expect(personSettlementRows(tripBills(), 'aisha')).toEqual({
      receive: ['hotel-aisha'],
      pay: ['dinner-aisha'],
    });
    expect(personSettlementRows(tripBills(), 'ben')).toEqual({ receive: ['hotel-ben'], pay: [] });
    expect(
      personSettlementRows(tripBills({ dinnerPaidAt: '2026-11-12T09:00:00.000Z' }), 'aisha'),
    ).toEqual({ receive: ['hotel-aisha'], pay: [] });
  });

  it('says where the user stands with a person', () => {
    expect(personBalanceState({ netReporting: 170, unpaidBillCount: 2 })).toBe('owes_you');
    expect(personBalanceState({ netReporting: -30, unpaidBillCount: 1 })).toBe('you_owe');
    expect(personBalanceState({ netReporting: 0, unpaidBillCount: 2 })).toBe('even');
    expect(personBalanceState({ netReporting: 0, unpaidBillCount: 0 })).toBe('settled');
  });
});

describe('a debt the user pays back in parts', () => {
  // Aisha paid dinner; of the user's RM30 share RM10 is paid, RM20 still owed.
  const dinner = (rootPaidAt: string | null = null) =>
    makeTx({
      id: 'dinner',
      amount: 20,
      reportingAmount: 20,
      accountId: null,
      date: '2026-11-06',
      splits: [
        makeSplit({ id: 'me', transactionId: 'dinner', isSelf: true, amount: 20 }),
        makeSplit({
          id: 'payer',
          transactionId: 'dinner',
          personName: 'Aisha',
          amount: 0,
          isPayer: true,
          shareAmount: 30,
          paidAt: rootPaidAt,
          paybackAccountId: rootPaidAt ? 'maybank' : null,
        }),
        makeSplit({
          id: 'part',
          transactionId: 'dinner',
          personName: 'Aisha',
          amount: 0,
          shareAmount: 10,
          partOfSplitId: 'payer',
          paidAt: '2026-11-08T09:00:00.000Z',
          paidTransactionId: 'tx-part',
          paybackAccountId: 'cash',
        }),
      ],
    });

  it('owes what is left and keeps the part as paid history of the same share', () => {
    const summary = aggregateSettleUpByPerson([dinner()], { reportingCurrency: 'USD' });
    const [aisha] = summary.people;
    expect(aisha).toMatchObject({
      owedReporting: 20,
      owedPaidReporting: 10,
      netReporting: -20,
      unpaidBillCount: 1,
      youOweCount: 1,
    });
    expect(aisha!.bills).toEqual([
      expect.objectContaining({
        splitId: 'payer',
        amount: 20,
        paidAt: null,
        shareTotal: 30,
        sharePaid: 10,
        shareKey: 'payer',
      }),
      expect.objectContaining({
        splitId: 'part',
        amount: 10,
        paidAt: '2026-11-08T09:00:00.000Z',
        paybackAccountId: 'cash',
        shareTotal: 30,
        sharePaid: 10,
        shareKey: 'payer',
      }),
    ]);
  });

  it('shows the bill as one share with its payment', () => {
    const summary = aggregateSettleUpByTransaction([dinner()], { reportingCurrency: 'USD' });
    expect(summary.transactions[0]).toMatchObject({
      paidBy: { name: 'Aisha', key: 'aisha' },
      billTotalNative: 60,
      totalNative: 20,
      paidNative: 10,
      unpaidSplitCount: 1,
      splitCount: 2,
    });
    expect(summary.owedReporting).toBe(20);
  });

  it('is settled once the rest is paid, and Settle up has nothing left to pay', () => {
    const paid = [dinner('2026-11-12T09:00:00.000Z')];
    const summary = aggregateSettleUpByPerson(paid, { reportingCurrency: 'USD' });
    expect(summary.people[0]).toMatchObject({
      owedReporting: 0,
      owedPaidReporting: 30,
      unpaidBillCount: 0,
    });
    expect(personSettlementRows(paid, 'aisha')).toEqual({ receive: [], pay: [] });
    expect(personSettlementRows([dinner()], 'aisha')).toEqual({ receive: [], pay: ['payer'] });
    expect(countUnpaidSplitBills(paid)).toBe(0);
    expect(countUnpaidSplitBills([dinner()])).toBe(1);
  });
});

describe('people who are real users', () => {
  it('groups shares by member before name, apart from a name alone', () => {
    const bill = makeTx({
      id: 'a',
      splits: [
        makeSplit({ id: 's1', transactionId: 'a', personName: 'Aisha', memberId: 'u1' }),
        makeSplit({ id: 's2', transactionId: 'a', personName: 'Aisha B.', memberId: 'u1' }),
        makeSplit({ id: 's3', transactionId: 'a', personName: 'Aisha' }),
      ],
    });
    const summary = aggregateSettleUpByPerson([bill], { reportingCurrency: 'USD' });
    expect(summary.people.map((person) => [person.key, person.memberId, person.billCount])).toEqual(
      [
        ['member:u1', 'u1', 1],
        ['aisha', null, 1],
      ],
    );
    expect(personSettlementRows([bill], 'member:u1')).toEqual({
      receive: ['s1', 's2'],
      pay: [],
    });
    expect(countUnpaidDebtors([bill])).toBe(2);
  });
});
