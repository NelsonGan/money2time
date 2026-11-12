import {
  type GroupDebt,
  openShares,
  pairwiseDebts,
  settleDebt,
  simplifyDebts,
} from '~/features/albums/lib/groupDebts';
import type { AlbumExpense, AlbumSettlement } from '~/types';

const at = '2026-11-12T00:00:00.000Z';

/** A bill `paidBy` paid, with what each other member owes of it. */
function bill(
  id: string,
  paidBy: string,
  owes: Record<string, number>,
  overrides: Partial<AlbumExpense> = {},
): AlbumExpense {
  const shares = Object.entries(owes).map(([memberId, amount]) => ({ memberId, amount }));
  return {
    id,
    groupId: 'bali',
    date: '2026-11-12',
    note: id,
    amount: shares.reduce((sum, share) => sum + share.amount, 0),
    currency: 'MYR',
    categoryName: null,
    categoryIcon: null,
    paidBy,
    shares,
    createdBy: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

function payment(id: string, expenseId: string, from: string, to: string, amount: number) {
  return {
    id,
    groupId: 'bali',
    expenseId,
    fromMember: from,
    toMember: to,
    amount,
    currency: 'MYR',
    date: '2026-11-13',
    createdBy: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  } satisfies AlbumSettlement;
}

const text = (debts: GroupDebt[]) =>
  debts.map((debt) => `${debt.from}>${debt.to} ${debt.currency} ${debt.amount}`);

/** The group after `payments` are recorded on its bills. */
function after(
  expenses: AlbumExpense[],
  payments: { expenseId: string; from: string; to: string; amount: number }[],
) {
  return openShares(
    expenses,
    payments.map((item, index) =>
      payment(`p${index}`, item.expenseId, item.from, item.to, item.amount),
    ),
  );
}

describe('who owes whom', () => {
  it('is each share still owed to the bill’s payer, per currency, each pair netted', () => {
    const expenses = [
      bill('dinner', 'nelson', { nelson: 30, aisha: 30, ben: 30 }),
      bill('taxi', 'aisha', { aisha: 10, nelson: 10 }),
      bill('sushi', 'ben', { ben: 1500, nelson: 1500 }, { currency: 'JPY' }),
      bill('gone', 'ben', { nelson: 99 }, { deletedAt: at }),
    ];
    const open = openShares(expenses, [payment('s1', 'dinner', 'ben', 'nelson', 12)]);
    expect(open).toEqual([
      { expenseId: 'dinner', from: 'aisha', to: 'nelson', currency: 'MYR', amount: 30 },
      { expenseId: 'dinner', from: 'ben', to: 'nelson', currency: 'MYR', amount: 18 },
      { expenseId: 'sushi', from: 'nelson', to: 'ben', currency: 'JPY', amount: 1500 },
      { expenseId: 'taxi', from: 'nelson', to: 'aisha', currency: 'MYR', amount: 10 },
    ]);
    expect(text(pairwiseDebts(open))).toEqual([
      'nelson>ben JPY 1500',
      'aisha>nelson MYR 20',
      'ben>nelson MYR 18',
    ]);
  });
});

describe('simplify group debts', () => {
  it('passes a debt along a chain', () => {
    // Anna owes Bob, Bob owes Charlie: Anna pays Charlie.
    const open = openShares(
      [bill('a', 'bob', { anna: 20 }), bill('b', 'charlie', { bob: 20 })],
      [],
    );
    expect(text(pairwiseDebts(open))).toEqual(['anna>bob MYR 20', 'bob>charlie MYR 20']);
    expect(text(simplifyDebts(open))).toEqual(['anna>charlie MYR 20']);
  });

  it('drops a circle, and leaves separate debts alone', () => {
    const circle = openShares(
      [bill('a', 'b', { a: 10 }), bill('b', 'c', { b: 10 }), bill('c', 'a', { c: 10 })],
      [],
    );
    expect(simplifyDebts(circle)).toEqual([]);
    // Nothing joins the two pairs, so neither can pay the other's debt.
    const apart = openShares([bill('a', 'b', { a: 10 }), bill('b', 'd', { c: 10 })], []);
    expect(text(simplifyDebts(apart))).toEqual(['a>b MYR 10', 'c>d MYR 10']);
  });

  it('keeps what everyone owes or is owed in total, with nobody in the middle', () => {
    const expenses = [
      bill('hotel', 'nelson', { nelson: 100, aisha: 100, ben: 100, chen: 100 }),
      bill('dinner', 'aisha', { nelson: 40, aisha: 40, ben: 40 }),
      bill('taxi', 'ben', { chen: 15, ben: 15 }),
      bill('snacks', 'chen', { aisha: 8, nelson: 8 }),
    ];
    const open = openShares(expenses, []);
    const debts = pairwiseDebts(open);
    const simple = simplifyDebts(open);
    const net = (list: GroupDebt[]) => {
      const totals: Record<string, number> = {};
      for (const debt of list) {
        totals[debt.from] = (totals[debt.from] ?? 0) - Math.round(debt.amount * 100);
        totals[debt.to] = (totals[debt.to] ?? 0) + Math.round(debt.amount * 100);
      }
      return Object.fromEntries(Object.entries(totals).filter(([, value]) => value !== 0));
    };
    expect(net(simple)).toEqual(net(debts));
    const payers = new Set(simple.map((debt) => debt.from));
    expect(simple.some((debt) => payers.has(debt.to))).toBe(false);
    expect(simple.length).toBeLessThan(debts.length);
  });

  it('finds the fewest payments when the bills can carry them', () => {
    // A dinner one paid and a boat another paid, each split four ways.
    const open = openShares(
      [
        bill('dinner', 'me', { me: 30, aisha: 30, ben: 30, chen: 30 }),
        bill('boat', 'aisha', { me: 40, aisha: 40, ben: 40, chen: 40 }),
      ],
      [],
    );
    expect(pairwiseDebts(open)).toHaveLength(5);
    expect(text(simplifyDebts(open))).toEqual([
      'ben>aisha MYR 70',
      'chen>aisha MYR 20',
      'chen>me MYR 50',
    ]);
  });
});

describe('settling a debt', () => {
  it('pays a simplified debt through the bills in between', () => {
    const expenses = [bill('a', 'bob', { anna: 20 }), bill('b', 'charlie', { bob: 20 })];
    const open = openShares(expenses, []);
    const [debt] = simplifyDebts(open);
    const payments = settleDebt(open, debt);
    expect(payments).toEqual([
      { expenseId: 'a', from: 'anna', to: 'bob', amount: 20 },
      { expenseId: 'b', from: 'bob', to: 'charlie', amount: 20 },
    ]);
    expect(after(expenses, payments)).toEqual([]);
  });

  it('closes both ways between two people', () => {
    const expenses = [bill('x', 'c', { a: 10 }), bill('y', 'a', { c: 4 })];
    const open = openShares(expenses, []);
    expect(text(pairwiseDebts(open))).toEqual(['a>c MYR 6']);
    const payments = settleDebt(open, { from: 'a', to: 'c', currency: 'MYR', amount: 6 });
    expect(payments).toEqual([
      { expenseId: 'x', from: 'a', to: 'c', amount: 10 },
      { expenseId: 'y', from: 'c', to: 'a', amount: 4 },
    ]);
    // Nothing is owed along the way: nothing to record.
    expect(settleDebt(open, { from: 'c', to: 'b', currency: 'MYR', amount: 5 })).toEqual([]);
    expect(settleDebt(open, { from: 'a', to: 'c', currency: 'USD', amount: 5 })).toEqual([]);
  });

  it('settles the whole group once every simplified debt is paid', () => {
    const expenses = [
      bill('hotel', 'nelson', { nelson: 100, aisha: 100, ben: 100, chen: 100 }),
      bill('dinner', 'aisha', { nelson: 40, aisha: 40, ben: 40 }),
      bill('taxi', 'ben', { chen: 15, ben: 15 }),
      bill('snacks', 'chen', { aisha: 8, nelson: 8 }),
      bill('museum', 'chen', { ben: 30, chen: 30 }),
    ];
    const recorded: { expenseId: string; from: string; to: string; amount: number }[] = [];
    for (let round = 0; round < 10; round += 1) {
      const open = after(expenses, recorded);
      const [debt] = simplifyDebts(open);
      if (!debt) break;
      const payments = settleDebt(open, debt);
      expect(payments.length).toBeGreaterThan(0);
      recorded.push(...payments);
    }
    expect(after(expenses, recorded)).toEqual([]);
  });

  it('pays part of a simplified debt along the chain, and the rest stays owed', () => {
    const expenses = [bill('a', 'bob', { anna: 20 }), bill('b', 'charlie', { bob: 20 })];
    const open = openShares(expenses, []);
    const payments = settleDebt(open, { from: 'anna', to: 'charlie', currency: 'MYR', amount: 5 });
    expect(payments).toEqual([
      { expenseId: 'a', from: 'anna', to: 'bob', amount: 5 },
      { expenseId: 'b', from: 'bob', to: 'charlie', amount: 5 },
    ]);
    expect(text(simplifyDebts(after(expenses, payments)))).toEqual(['anna>charlie MYR 15']);
  });

  it('closes every bill when shares do not divide evenly', () => {
    // RM100 three ways, twice, paid by different people: odd cents either way.
    const expenses = [
      bill('one', 'a', { a: 33.34, b: 33.33, c: 33.33 }),
      bill('two', 'b', { a: 33.33, b: 33.34, c: 33.33 }),
      bill('three', 'c', { a: 0.01, c: 0.02 }),
    ];
    const recorded: { expenseId: string; from: string; to: string; amount: number }[] = [];
    for (let round = 0; round < 10; round += 1) {
      const open = after(expenses, recorded);
      const [debt] = simplifyDebts(open);
      if (!debt) break;
      recorded.push(...settleDebt(open, debt));
    }
    expect(after(expenses, recorded)).toEqual([]);
    // Nobody was asked to pay more than their shares came to.
    const paidBy = (member: string) =>
      Math.round(
        recorded
          .filter((item) => item.from === member)
          .reduce((sum, item) => sum + item.amount * 100, 0),
      );
    expect(paidBy('c')).toBe(6666);
    expect(paidBy('a')).toBe(3334);
    expect(paidBy('b')).toBe(3333);
  });

  it('pays part of a debt across several bills, the oldest first', () => {
    const expenses = [
      bill('late', 'b', { a: 10 }, { date: '2026-11-14' }),
      bill('early', 'b', { a: 10 }, { date: '2026-11-10' }),
    ];
    expect(
      settleDebt(openShares(expenses, []), { from: 'a', to: 'b', currency: 'MYR', amount: 15 }),
    ).toEqual([
      { expenseId: 'early', from: 'a', to: 'b', amount: 10 },
      { expenseId: 'late', from: 'a', to: 'b', amount: 5 },
    ]);
  });
});
