import {
  evenPayments,
  type GroupDebt,
  openShares,
  paidFrom,
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
    category: 'other',
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

describe('a bill whose currency changed after a payment', () => {
  it('keeps the payment, owed back in its own currency, and settles when paid back', () => {
    // Ben paid Nelson MYR 30 on dinner; then dinner was changed to USD.
    const dinner = bill('dinner', 'nelson', { nelson: 10, ben: 10 }, { currency: 'USD' });
    const paid = payment('s1', 'dinner', 'ben', 'nelson', 30);
    expect(openShares([dinner], [paid])).toEqual([
      { expenseId: 'dinner', from: 'ben', to: 'nelson', currency: 'USD', amount: 10 },
      { expenseId: 'dinner', from: 'nelson', to: 'ben', currency: 'MYR', amount: 30 },
    ]);
    // Paying the ringgit back on the bill closes that side.
    const back = { ...payment('s2', 'dinner', 'nelson', 'ben', 30) };
    expect(openShares([dinner], [paid, back])).toEqual([
      { expenseId: 'dinner', from: 'ben', to: 'nelson', currency: 'USD', amount: 10 },
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
      if (!debt) {
        // Even now: what is left goes round in circles, and closes (as the app does next).
        recorded.push(...evenPayments(open));
        break;
      }
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

  it('leaves other pairs alone when debts are not simplified', () => {
    // b, c and d owe round in a circle, b owes a, and a owes x.
    const expenses = [
      bill('ab', 'a', { b: 10 }),
      bill('bc', 'b', { c: 10 }),
      bill('cd', 'c', { d: 10 }),
      bill('db', 'd', { b: 10 }),
      bill('xa', 'x', { a: 5 }),
    ];
    const open = openShares(expenses, []);
    const debt = { from: 'a', to: 'x', currency: 'MYR', amount: 5 };
    expect(settleDebt(open, debt, { simplified: false })).toEqual([
      { expenseId: 'xa', from: 'a', to: 'x', amount: 5 },
    ]);
    // A part payment between two moves only their own lines.
    const part = settleDebt(
      open,
      { from: 'b', to: 'a', currency: 'MYR', amount: 4 },
      {
        simplified: false,
      },
    );
    expect(part).toEqual([{ expenseId: 'ab', from: 'b', to: 'a', amount: 4 }]);
    expect(text(pairwiseDebts(after(expenses, part)))).toEqual([
      'a>x MYR 5',
      'b>a MYR 6',
      'b>d MYR 10',
      'c>b MYR 10',
      'd>c MYR 10',
    ]);
  });

  it("sets off only the two people's own debts when not simplified", () => {
    const expenses = [bill('x', 'c', { a: 10 }), bill('y', 'a', { c: 4 })];
    const payments = settleDebt(
      openShares(expenses, []),
      { from: 'a', to: 'c', currency: 'MYR', amount: 6 },
      { simplified: false },
    );
    expect(payments).toEqual([
      { expenseId: 'x', from: 'a', to: 'c', amount: 10 },
      { expenseId: 'y', from: 'c', to: 'a', amount: 4 },
    ]);
  });
});

describe('a bill changed or deleted after it was paid (README: Anyone in it can change it)', () => {
  it('owes back what was paid past a share an edit lowered', () => {
    // Ben paid his 30 of Dinner; then it was edited down to 20 each.
    const paid = [payment('p1', 'dinner', 'ben', 'me', 30)];
    const edited = [bill('dinner', 'me', { me: 20, ben: 20, tess: 20 })];
    expect(text(pairwiseDebts(openShares(edited, paid)))).toEqual([
      'me>ben MYR 10',
      'tess>me MYR 20',
    ]);
  });

  it('keeps the payments of a deleted bill, owed back to whoever paid them', () => {
    const paid = [payment('p1', 'dinner', 'ben', 'me', 30)];
    const deleted = [
      bill(
        'dinner',
        'me',
        { me: 30, ben: 30, tess: 30 },
        { deletedAt: '2026-11-14T00:00:00.000Z' },
      ),
    ];
    expect(text(pairwiseDebts(openShares(deleted, paid)))).toEqual(['me>ben MYR 30']);
    // A deleted bill nobody paid anything on owes nothing.
    expect(openShares(deleted, [])).toEqual([]);
  });

  it('a payment to someone who no longer paid the bill is owed back by them', () => {
    // Ben paid me for Dinner; then the payer was changed to Tess.
    const paid = [payment('p1', 'dinner', 'ben', 'me', 30)];
    const changed = [bill('dinner', 'tess', { me: 30, ben: 30, tess: 30 })];
    expect(text(pairwiseDebts(openShares(changed, paid)))).toEqual([
      'ben>tess MYR 30',
      'me>ben MYR 30',
      'me>tess MYR 30',
    ]);
  });

  it('settling what is owed back closes it', () => {
    const edited = [bill('dinner', 'me', { me: 20, ben: 20 })];
    const paid = [payment('p1', 'dinner', 'ben', 'me', 30)];
    const open = openShares(edited, paid);
    const [owedBack] = pairwiseDebts(open);
    expect(owedBack).toMatchObject({ from: 'me', to: 'ben', amount: 10 });
    const back = settleDebt(open, owedBack, { simplified: false });
    expect(back).toEqual([{ expenseId: 'dinner', from: 'me', to: 'ben', amount: 10 }]);
    const settled = [...paid, payment('p2', 'dinner', 'me', 'ben', 10)];
    expect(openShares(edited, settled)).toEqual([]);
  });
});

/** Groups made from a fixed seed, so every run checks the same ones. */
function randomGroups(count: number, seed: number) {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const pick = (n: number) => Math.floor(random() * n);
  const groups: AlbumExpense[][] = [];
  for (let index = 0; index < count; index += 1) {
    const people = Array.from({ length: 2 + pick(6) }, (_, i) => `m${i}`);
    const kind = index % 3;
    const expenses: AlbumExpense[] = [];
    for (let b = 0, n = 1 + pick(10); b < n; b += 1) {
      const on = people.filter(() => random() < 0.6);
      if (!on.length) on.push(people[pick(people.length)]);
      const total = [30, 60, 90, 45][pick(4)];
      const owes = Object.fromEntries(
        on.map((member) => [
          member,
          kind === 0
            ? Math.round((total / on.length) * 100) / 100 // split evenly
            : kind === 1
              ? [10, 20, 30, 15, 7.77][pick(5)] // round amounts
              : (1 + pick(5000)) / 100, // anything
        ]),
      );
      expenses.push(
        bill(`b${b}`, on[pick(on.length)], owes, { currency: random() < 0.1 ? 'USD' : 'MYR' }),
      );
    }
    groups.push(expenses);
  }
  return groups;
}

const recordedRows = (
  payments: { expenseId: string; from: string; to: string; amount: number }[],
  currency: string,
  offset: number,
) =>
  payments.map((item, index) => ({
    ...payment(`r${offset + index}`, item.expenseId, item.from, item.to, item.amount),
    currency,
  }));

/** Each member's net per currency in cents, from a list of debts. */
const netsOf = (debts: GroupDebt[]) => {
  const net = new Map<string, number>();
  for (const debt of debts) {
    const add = (member: string, value: number) =>
      net.set(`${member} ${debt.currency}`, (net.get(`${member} ${debt.currency}`) ?? 0) + value);
    add(debt.from, -Math.round(debt.amount * 100));
    add(debt.to, Math.round(debt.amount * 100));
  }
  return [...net].filter(([, value]) => value !== 0).sort(([a], [b]) => (a < b ? -1 : 1));
};

/** How much each member's balance moves with these payments, in cents. */
const moved = (payments: { from: string; to: string; amount: number }[]) => {
  const change = new Map<string, number>();
  for (const item of payments) {
    change.set(item.from, (change.get(item.from) ?? 0) + Math.round(item.amount * 100));
    change.set(item.to, (change.get(item.to) ?? 0) - Math.round(item.amount * 100));
  }
  return [...change].filter(([, value]) => value !== 0).sort(([a], [b]) => (a < b ? -1 : 1));
};

describe('simplified debts, on many groups', () => {
  const groups = randomGroups(600, 7);

  it('keep everyone’s net, with nobody in the middle and never more payments than each pair’s own', () => {
    for (const expenses of groups) {
      const open = openShares(expenses, []);
      const simple = simplifyDebts(open);
      const pairs = pairwiseDebts(open);
      expect(netsOf(simple)).toEqual(netsOf(pairs));
      expect(simple.length).toBeLessThanOrEqual(pairs.length);
      for (const currency of new Set(simple.map((debt) => debt.currency))) {
        const owing = new Set(
          simple.filter((debt) => debt.currency === currency).map((debt) => debt.from),
        );
        expect(simple.some((debt) => debt.currency === currency && owing.has(debt.to))).toBe(false);
      }
    }
  });

  it('pay in full or in part between the two alone, and leave every other debt as it was', () => {
    let checked = 0;
    for (const expenses of groups) {
      const open = openShares(expenses, []);
      const simple = simplifyDebts(open);
      // The rare group listed as each pair's own (`planDebts`) can change shape once paid.
      const pairList = text(pairwiseDebts(open)).sort().join();
      for (const debt of simple) {
        for (const amount of [debt.amount, Math.max(0.01, Math.floor(debt.amount * 33) / 100)]) {
          const payments = settleDebt(open, { ...debt, amount });
          const cents = Math.round(amount * 100);
          expect(moved(payments)).toEqual(
            [
              [debt.from, cents],
              [debt.to, -cents],
            ].sort(([a], [b]) => (a < b ? -1 : 1)),
          );
          expect(paidFrom(payments, debt.from)).toBe(cents / 100);
          const now = openShares(expenses, recordedRows(payments, debt.currency, 0));
          const left = simplifyDebts(now);
          if (
            text(simple).sort().join() === pairList ||
            text(left).sort().join() === text(pairwiseDebts(now)).sort().join()
          )
            continue;
          const expected = simple
            .map((item) =>
              item === debt
                ? { ...item, amount: Math.round((item.amount - amount) * 100) / 100 }
                : item,
            )
            .filter((item) => item.amount > 0);
          expect(text(left).sort()).toEqual(text(expected).sort());
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('settle every bill once each is paid and the circles left are closed', () => {
    for (const expenses of groups) {
      let settlements: AlbumSettlement[] = [];
      for (let round = 0; round < 40; round += 1) {
        const open = openShares(expenses, settlements);
        const [debt] = simplifyDebts(open);
        if (!debt) {
          settlements = settlements.concat(
            evenPayments(open).flatMap((item, index) =>
              recordedRows([item], item.currency, settlements.length + index),
            ),
          );
          break;
        }
        const payments = settleDebt(open, debt);
        expect(paidFrom(payments, debt.from)).toBe(debt.amount);
        settlements = settlements.concat(recordedRows(payments, debt.currency, settlements.length));
      }
      expect(openShares(expenses, settlements)).toEqual([]);
    }
  });
});

describe('a big album', () => {
  /** `people` sharing every bill evenly, each paid by one of them, nothing paid back yet. */
  function household(people: number, bills: number) {
    const members = Array.from({ length: people }, (_, i) => `m${i}`);
    return Array.from({ length: bills }, (_, b) =>
      bill(
        `b${String(b).padStart(4, '0')}`,
        members[(b * 7) % people],
        Object.fromEntries(members.map((member) => [member, 10 + ((b * 13) % 40)])),
      ),
    );
  }

  it('pays a debt with only the bills on its way, not every bill in the album', () => {
    const expenses = household(4, 200);
    const open = openShares(expenses, []);
    expect(open).toHaveLength(600);
    for (const debt of simplifyDebts(open)) {
      expect(settleDebt(open, debt).length).toBeLessThan(250);
    }
  });

  it('splits a payment past the row limit into acts that fit, paying all of it', () => {
    // One of two paid all 300 bills: the other's debt runs across every one.
    const expenses = Array.from({ length: 300 }, (_, b) => bill(`b${b}`, 'a', { a: 10, b: 10 }));
    let settlements: AlbumSettlement[] = [];
    const [debt] = simplifyDebts(openShares(expenses, []));
    let left = Math.round(debt.amount * 100);
    let acts = 0;
    while (left > 0) {
      const open = openShares(expenses, settlements);
      const payments = settleDebt(open, { ...debt, amount: left / 100 }, { maxRows: 100 });
      expect(payments.length).toBeGreaterThan(0);
      expect(payments.length).toBeLessThanOrEqual(100);
      expect(moved(payments).map(([member]) => member)).toEqual([debt.from, debt.to].sort());
      left -= Math.round(paidFrom(payments, debt.from) * 100);
      settlements = settlements.concat(recordedRows(payments, 'MYR', settlements.length));
      acts += 1;
    }
    expect(acts).toBe(3);
    expect(openShares(expenses, settlements)).toEqual([]);
  });

  it('closes an even group in parts that fit, staying even in between', () => {
    // Round in a circle, many bills each way: everyone is even.
    const expenses = Array.from({ length: 90 }, (_, b) =>
      bill(`b${b}`, ['a', 'b', 'c'][b % 3], { [['b', 'c', 'a'][b % 3]]: 10 }),
    );
    let settlements: AlbumSettlement[] = [];
    expect(simplifyDebts(openShares(expenses, []))).toEqual([]);
    for (let round = 0; round < 10; round += 1) {
      const open = openShares(expenses, settlements);
      const closing = evenPayments(open, 40);
      if (!closing.length) break;
      expect(closing.length).toBeLessThanOrEqual(40);
      expect(moved(closing)).toEqual([]);
      settlements = settlements.concat(
        closing.flatMap((item, index) =>
          recordedRows([item], item.currency, settlements.length + index),
        ),
      );
      expect(simplifyDebts(openShares(expenses, settlements))).toEqual([]);
    }
    expect(openShares(expenses, settlements)).toEqual([]);
  });
});

describe('paying one simplified debt', () => {
  it('leaves another pair’s debt alone (a review case that used to move)', () => {
    // m0 and m2 owe on m4's bill; m0 and m1 owe on m2's.
    const expenses = [
      bill('rent', 'm4', { m0: 20, m2: 30 }),
      bill('food', 'm2', { m0: 10, m1: 30 }),
    ];
    const open = openShares(expenses, []);
    const before = simplifyDebts(open);
    const [first] = before;
    const part = settleDebt(open, { ...first, amount: first.amount / 2 });
    const now = simplifyDebts(openShares(expenses, recordedRows(part, 'MYR', 0)));
    expect(text(now.filter((debt) => debt.from !== first.from))).toEqual(
      text(before.filter((debt) => debt.from !== first.from)),
    );
  });
});
