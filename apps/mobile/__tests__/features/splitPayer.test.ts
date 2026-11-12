import {
  billPayer,
  draftPayer,
  friendPaidBillTotal,
  friendPaidExpense,
  friendShare,
  isFriendPaidBill,
  isPayBackPart,
  owedToPayer,
  owesPayer,
  paidBackInParts,
  selfShare,
  storedFriendPaidRow,
} from '~/features/transactions/lib/splitPayer';
import type { TransactionSplit } from '~/types';

function makeSplit(overrides: Partial<TransactionSplit>): TransactionSplit {
  return {
    id: overrides.id ?? 's1',
    transactionId: 't1',
    personName: 'Aisha',
    amount: 0,
    isSelf: false,
    paybackAccountId: null,
    paidAt: null,
    paidTransactionId: null,
    partOfSplitId: null,
    isPayer: false,
    shareAmount: null,
    memberId: null,
    sortOrder: 0,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

/** Dinner RM90 that Aisha paid, split three ways with Ben. */
const friendPaid = [
  makeSplit({ id: 'me', isSelf: true, personName: null, amount: 30 }),
  makeSplit({ id: 'aisha', personName: ' Aisha ', isPayer: true, shareAmount: 30 }),
  makeSplit({ id: 'ben', personName: 'Ben', shareAmount: 30 }),
];

/** The same dinner paid by the user: Aisha and Ben each owe RM30. */
const selfPaid = [
  makeSplit({ id: 'me', isSelf: true, personName: null, amount: 30 }),
  makeSplit({ id: 'aisha', amount: 30 }),
  makeSplit({ id: 'ben', personName: 'Ben', amount: 30 }),
];

describe('billPayer', () => {
  it('is null on a bill the user paid, and on no splits at all', () => {
    expect(billPayer(selfPaid)).toBeNull();
    expect(billPayer(undefined)).toBeNull();
    expect(isFriendPaidBill(selfPaid)).toBe(false);
  });

  it('is the friend whose row carries isPayer', () => {
    expect(billPayer(friendPaid)?.id).toBe('aisha');
    expect(isFriendPaidBill(friendPaid)).toBe(true);
  });

  it('ignores the flag on the Me row and on a part payment', () => {
    expect(billPayer([makeSplit({ isSelf: true, isPayer: true })])).toBeNull();
    expect(billPayer([makeSplit({ isPayer: true, partOfSplitId: 'root' })])).toBeNull();
  });
});

describe('shares', () => {
  it("reads a friend's share from shareAmount on a bill a friend paid, else from amount", () => {
    expect(friendShare(friendPaid[2]!)).toBe(30);
    expect(friendShare(selfPaid[2]!)).toBe(30);
  });

  it('takes the Me row as the user share, else the expense itself', () => {
    expect(selfShare(friendPaid, 99)).toBe(30);
    expect(selfShare([makeSplit({ isPayer: true, shareAmount: 60 })], 40)).toBe(40);
  });

  it('adds every share back up to the whole bill', () => {
    expect(friendPaidBillTotal(friendPaid, 30)).toBe(90);
    // Odd cents: 100 three ways is 33.34 + 33.33 + 33.33.
    expect(
      friendPaidBillTotal(
        [
          makeSplit({ id: 'me', isSelf: true, amount: 33.34 }),
          makeSplit({ id: 'a', isPayer: true, shareAmount: 33.33 }),
          makeSplit({ id: 'b', shareAmount: 33.33 }),
        ],
        33.34,
      ),
    ).toBe(100);
  });
});

describe('owedToPayer', () => {
  it('is null on a bill the user paid', () => {
    expect(owedToPayer(selfPaid, 90)).toBeNull();
    expect(owesPayer(selfPaid, 90)).toBe(false);
  });

  it('is the user share, owed to the payer by their trimmed name', () => {
    expect(owedToPayer(friendPaid, 30)).toEqual({
      splitId: 'aisha',
      personName: 'Aisha',
      memberId: null,
      amount: 30,
      owed: 30,
      total: 30,
      paid: 0,
      paidAt: null,
      paidFromAccountId: null,
      payments: [],
    });
    expect(owesPayer(friendPaid, 30)).toBe(true);
  });

  it('is settled once the payer row is paid, from the account it was paid from', () => {
    const paid = friendPaid.map((split) =>
      split.id === 'aisha'
        ? { ...split, paidAt: '2026-11-12T08:00:00.000Z', paybackAccountId: 'maybank' }
        : split,
    );
    expect(owedToPayer(paid, 30)).toMatchObject({
      amount: 30,
      owed: 0,
      total: 30,
      paid: 30,
      paidAt: '2026-11-12T08:00:00.000Z',
      paidFromAccountId: 'maybank',
    });
    expect(owesPayer(paid, 30)).toBe(false);
  });

  it('owes nothing when the user had no share of the bill', () => {
    const none = friendPaid.map((split) => (split.isSelf ? { ...split, amount: 0 } : split));
    expect(owesPayer(none, 0)).toBe(false);
  });

  it('names an unnamed payer null', () => {
    expect(
      owedToPayer([makeSplit({ personName: '  ', isPayer: true })], 12)?.personName,
    ).toBeNull();
  });
});

describe('paying the payer back in parts', () => {
  // Of the RM30 share, RM10 then RM5 are paid: the bill and the Me row are
  // down to the RM15 still owed, and each part is a paid row under the payer's.
  const partPaid = [
    makeSplit({ id: 'me', isSelf: true, personName: null, amount: 15 }),
    makeSplit({ id: 'aisha', personName: 'Aisha', isPayer: true, shareAmount: 30 }),
    makeSplit({
      id: 'p2',
      personName: 'Aisha',
      partOfSplitId: 'aisha',
      shareAmount: 5,
      paidAt: '2026-11-10T08:00:00.000Z',
      paidTransactionId: 'tx-p2',
      paybackAccountId: 'cash',
    }),
    makeSplit({
      id: 'p1',
      personName: 'Aisha',
      partOfSplitId: 'aisha',
      shareAmount: 10,
      paidAt: '2026-11-08T08:00:00.000Z',
      paidTransactionId: 'tx-p1',
      paybackAccountId: 'maybank',
    }),
    makeSplit({ id: 'ben', personName: 'Ben', shareAmount: 30 }),
  ];

  it('knows a part by its paid row under the payer', () => {
    expect(partPaid.map((split) => isPayBackPart(split))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
    // A friend's part payment on a bill the user paid holds its amount in `amount`.
    expect(
      isPayBackPart(makeSplit({ partOfSplitId: 'root', amount: 10, paidAt: '2026-11-08' })),
    ).toBe(false);
  });

  it('owes what is left, with the parts listed oldest first', () => {
    expect(owedToPayer(partPaid, 15)).toMatchObject({
      amount: 15,
      owed: 15,
      total: 30,
      paid: 15,
      paidAt: null,
      payments: [
        { splitId: 'p1', amount: 10, paidFromAccountId: 'maybank', transactionId: 'tx-p1' },
        { splitId: 'p2', amount: 5, paidFromAccountId: 'cash', transactionId: 'tx-p2' },
      ],
    });
    expect(paidBackInParts(partPaid)).toBe(15);
    expect(owesPayer(partPaid, 15)).toBe(true);
  });

  it('is fully paid once the rest is paid too', () => {
    const settled = partPaid.map((split) =>
      split.id === 'aisha' ? { ...split, paidAt: '2026-11-12T08:00:00.000Z' } : split,
    );
    expect(owedToPayer(settled, 15)).toMatchObject({ amount: 15, owed: 0, total: 30, paid: 30 });
    expect(owesPayer(settled, 15)).toBe(false);
  });

  it('keeps the whole bill the same however much is paid', () => {
    // 15 still owed + 15 paid in parts + Aisha 30 + Ben 30.
    expect(friendPaidBillTotal(partPaid, 15)).toBe(90);
  });

  it('has paid nothing in parts on a bill the user paid', () => {
    expect(paidBackInParts(selfPaid)).toBe(0);
    expect(paidBackInParts(undefined)).toBe(0);
  });
});

describe('editor rows', () => {
  it('finds the payer row of a draft', () => {
    const rows = [
      { amount: '30.00', isSelf: true },
      { amount: '30.00', isSelf: false, isPayer: true },
    ];
    expect(draftPayer(rows)).toBe(rows[1]);
    expect(draftPayer([{ amount: '30.00', isSelf: true, isPayer: true }])).toBeNull();
  });

  it('stores a friend row with its share beside a zero amount, and Me as it is', () => {
    expect(storedFriendPaidRow({ amount: 30, isSelf: false, personName: 'Ben' })).toEqual({
      amount: 0,
      shareAmount: 30,
      isSelf: false,
      personName: 'Ben',
    });
    expect(storedFriendPaidRow({ amount: 30, isSelf: true })).toEqual({
      amount: 30,
      shareAmount: null,
      isSelf: true,
    });
  });
});

describe('friendPaidExpense', () => {
  const bill = {
    amount: 90,
    accountId: 'maybank',
    accountAmount: null,
    note: 'Dinner',
  };

  it('saves the user share on no account while it is still owed', () => {
    expect(friendPaidExpense(bill, 30, false)).toEqual({
      amount: 30,
      accountId: null,
      accountAmount: null,
      note: 'Dinner',
    });
  });

  it('keeps the account it was paid from once the friend is paid back', () => {
    expect(friendPaidExpense(bill, 30, true)).toMatchObject({ amount: 30, accountId: 'maybank' });
  });

  it('shrinks the frozen snapshots by the same ratio', () => {
    const foreign = {
      amount: 9000,
      accountId: 'maybank',
      accountAmount: 270,
      reportingAmount: 270,
      fxRate: 0.03,
    };
    expect(friendPaidExpense(foreign, 3000, true)).toEqual({
      amount: 3000,
      accountId: 'maybank',
      accountAmount: 90,
      reportingAmount: 90,
      fxRate: 0.03,
    });
    expect(friendPaidExpense(foreign, 3000, false)).toMatchObject({
      accountId: null,
      accountAmount: null,
      reportingAmount: 90,
    });
  });

  it('leaves a snapshot the editor did not supply for the save to freeze', () => {
    expect('reportingAmount' in friendPaidExpense(bill, 30, false)).toBe(false);
  });

  it('is zero for a bill the user had no share of', () => {
    expect(friendPaidExpense(bill, 0, false).amount).toBe(0);
    expect(friendPaidExpense({ ...bill, amount: 0 }, 0, false).amount).toBe(0);
  });
});
