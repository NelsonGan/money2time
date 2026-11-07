import {
  applyShareHandover,
  applyUnpaidMerge,
  consolidateOwedRows,
  cutPartPayment,
  evenOwedAmounts,
  planShareHandover,
  planSplitPayment,
  planUnpaidMerge,
  splitShareKey,
  summarizeSplitShares,
} from '~/features/transactions/lib/splitPayments';
import type { TransactionSplit } from '~/types';

function split(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: 's1',
    transactionId: 't1',
    personName: 'Aisha',
    amount: 1000,
    isSelf: false,
    paybackAccountId: null,
    paidAt: null,
    paidTransactionId: null,
    partOfSplitId: null,
    sortOrder: 0,
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const PAID = '2026-11-02T10:00:00.000Z';

describe('splitShareKey', () => {
  it('is the row itself, or the row a part payment came out of', () => {
    expect(splitShareKey(split({ id: 'a' }))).toBe('a');
    expect(splitShareKey(split({ id: 'p', partOfSplitId: 'a' }))).toBe('a');
  });
});

describe('summarizeSplitShares', () => {
  it('rolls a share paid in parts up into one total', () => {
    const shares = summarizeSplitShares([
      split({ id: 'me', isSelf: true, amount: 1000 }),
      split({ id: 'a', amount: 500 }),
      split({ id: 'p1', amount: 300, paidAt: PAID, partOfSplitId: 'a' }),
      split({ id: 'p2', amount: 200, paidAt: PAID, partOfSplitId: 'a' }),
      split({ id: 'b', personName: 'Ben' }),
    ]);
    expect(shares.get('a')).toEqual({
      total: 1000,
      paid: 500,
      owed: 500,
      paymentCount: 2,
    });
    expect(shares.get('b')).toEqual({
      total: 1000,
      paid: 0,
      owed: 1000,
      paymentCount: 0,
    });
    expect(shares.has('me')).toBe(false);
  });

  it('keeps unnamed friends apart', () => {
    const shares = summarizeSplitShares([
      split({ id: 'a', personName: null, amount: 700 }),
      split({ id: 'p', personName: null, amount: 300, paidAt: PAID, partOfSplitId: 'a' }),
      split({ id: 'b', personName: null }),
    ]);
    expect(shares.get('a')?.total).toBe(1000);
    expect(shares.get('b')?.total).toBe(1000);
  });

  it('adds cents without float drift', () => {
    const shares = summarizeSplitShares([
      split({ id: 'a', amount: 0.1 }),
      split({ id: 'p', amount: 0.2, paidAt: PAID, partOfSplitId: 'a' }),
    ]);
    expect(shares.get('a')?.total).toBe(0.3);
  });
});

describe('planSplitPayment', () => {
  it('pays part of what is owed', () => {
    expect(planSplitPayment(1000, 300)).toEqual({ kind: 'partial', amount: 300, remaining: 700 });
  });

  it('settles the row when the payment covers it', () => {
    expect(planSplitPayment(700, 700)).toEqual({ kind: 'full', amount: 700 });
    expect(planSplitPayment(700, 699.999)).toEqual({ kind: 'full', amount: 700 });
  });

  it('rounds to the cent', () => {
    expect(planSplitPayment(100, 33.333)).toEqual({
      kind: 'partial',
      amount: 33.33,
      remaining: 66.67,
    });
  });

  it('refuses nothing, more than is owed, and a row that owes nothing', () => {
    expect(planSplitPayment(1000, 0)).toBeNull();
    expect(planSplitPayment(1000, -5)).toBeNull();
    expect(planSplitPayment(1000, Number.NaN)).toBeNull();
    expect(planSplitPayment(1000, 1000.01)).toBeNull();
    expect(planSplitPayment(0, 10)).toBeNull();
  });
});

describe('cutPartPayment', () => {
  it('lowers the unpaid row and puts the payment after it', () => {
    const part = split({
      id: 'p',
      amount: 300,
      paidAt: PAID,
      partOfSplitId: 'a',
      updatedAt: PAID,
    });
    const next = cutPartPayment(
      [split({ id: 'a' }), split({ id: 'b', personName: 'Ben' })],
      'a',
      part,
    );
    expect(next.map((s) => [s.id, s.amount])).toEqual([
      ['a', 700],
      ['p', 300],
      ['b', 1000],
    ]);
    expect(next[0]!.updatedAt).toBe(PAID);
  });
});

describe('planUnpaidMerge', () => {
  it('folds an undone payment back into the amount still owed', () => {
    const splits = [
      split({ id: 'a', amount: 700 }),
      split({ id: 'p', amount: 300, partOfSplitId: 'a' }),
    ];
    const merge = planUnpaidMerge(splits, 'p');
    expect(merge).toEqual({ keepId: 'a', dropId: 'p', amount: 1000 });
    expect(applyUnpaidMerge(splits, merge!, PAID)).toEqual([
      split({ id: 'a', amount: 1000, updatedAt: PAID }),
    ]);
  });

  it("keeps the share's first row when it is the one reopened", () => {
    const splits = [
      split({ id: 'a', amount: 700 }),
      split({ id: 'p', amount: 300, partOfSplitId: 'a' }),
    ];
    expect(planUnpaidMerge(splits, 'a')).toEqual({ keepId: 'a', dropId: 'p', amount: 1000 });
  });

  it('keeps the row already owed when the first row is paid', () => {
    const splits = [
      split({ id: 'a', amount: 500, paidAt: PAID }),
      split({ id: 'p1', amount: 300, partOfSplitId: 'a' }),
      split({ id: 'p2', amount: 200, partOfSplitId: 'a' }),
    ];
    expect(planUnpaidMerge(splits, 'p2')).toEqual({ keepId: 'p1', dropId: 'p2', amount: 500 });
  });

  it('leaves a share with nothing else owed, and other people, alone', () => {
    expect(
      planUnpaidMerge(
        [
          split({ id: 'a', amount: 700, paidAt: PAID }),
          split({ id: 'p', amount: 300, partOfSplitId: 'a' }),
          split({ id: 'b', personName: 'Ben' }),
        ],
        'p',
      ),
    ).toBeNull();
    expect(planUnpaidMerge([split({ id: 'a' })], 'missing')).toBeNull();
  });
});

describe('evenOwedAmounts', () => {
  it('matches a plain even split when nobody has paid', () => {
    expect(evenOwedAmounts(100, [0, 0, 0])).toEqual([33.34, 33.33, 33.33]);
  });

  it('keeps every share even when one is part paid', () => {
    // RM10,000 between 10; Aisha paid RM300, so RM9,700 is still owed.
    const owed = evenOwedAmounts(9700, [0, 300, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(owed[1]).toBe(700);
    expect(owed.filter((_, i) => i !== 1).every((value) => value === 1000)).toBe(true);
  });

  it('lets a share that paid more than its portion owe nothing, and still adds up', () => {
    const owed = evenOwedAmounts(100, [0, 90, 0]);
    expect(owed).toEqual([50, 0, 50]);
    expect(evenOwedAmounts(10, [0, 30, 0]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('handles no rows and nothing owed', () => {
    expect(evenOwedAmounts(50, [])).toEqual([]);
    expect(evenOwedAmounts(0, [0, 0])).toEqual([0, 0]);
  });
});

describe('planShareHandover', () => {
  const splits = [
    split({ id: 'a', amount: 700 }),
    split({ id: 'p2', amount: 200, paidAt: PAID, partOfSplitId: 'a', createdAt: '2026-11-03' }),
    split({ id: 'p1', amount: 100, paidAt: PAID, partOfSplitId: 'a', createdAt: '2026-11-01' }),
    split({ id: 'b', personName: 'Ben' }),
  ];

  it('makes the oldest part the first row when the first row goes', () => {
    const handover = planShareHandover(splits, 'a');
    expect(handover).toEqual({ newRootId: 'p1', repointIds: ['p2'] });
    const next = applyShareHandover(
      splits.filter((s) => s.id !== 'a'),
      handover!,
    );
    expect(next.map((s) => [s.id, s.partOfSplitId])).toEqual([
      ['p2', 'p1'],
      ['p1', null],
      ['b', null],
    ]);
  });

  it('does nothing for a part, or a first row without parts', () => {
    expect(planShareHandover(splits, 'p1')).toBeNull();
    expect(planShareHandover(splits, 'b')).toBeNull();
  });
});

describe('consolidateOwedRows', () => {
  it('folds a share owing on two rows into its first row, and leaves the rest', () => {
    const { splits, merges } = consolidateOwedRows(
      [
        split({ id: 'a', amount: 700 }),
        split({ id: 'p1', amount: 300, partOfSplitId: 'a' }),
        split({ id: 'p2', amount: 200, paidAt: PAID, partOfSplitId: 'a' }),
        split({ id: 'b', personName: 'Ben' }),
        split({ id: 'me', isSelf: true, amount: 0 }),
      ],
      PAID,
    );
    expect(merges).toEqual([{ keepId: 'a', dropId: 'p1', amount: 1000 }]);
    expect(splits.map((s) => [s.id, s.amount])).toEqual([
      ['a', 1000],
      ['p2', 200],
      ['b', 1000],
      ['me', 0],
    ]);
  });

  it('changes nothing when every share owes on one row', () => {
    const rows = [split({ id: 'a' }), split({ id: 'b', personName: 'Ben' })];
    expect(consolidateOwedRows(rows, PAID)).toEqual({ splits: rows, merges: [] });
  });
});
