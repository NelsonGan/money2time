import { openShares, pairwiseDebts, simplifyDebts } from '~/features/albums/lib/groupDebts';
import { selfNet } from '~/features/albums/lib/selfNet';
import type { AlbumExpense, AlbumSettlement } from '~/types';

const at = '2026-11-12T00:00:00.000Z';

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

function payment(expenseId: string, from: string, to: string, amount: number): AlbumSettlement {
  return {
    id: `${expenseId}:${from}:${to}`,
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
  };
}

describe('selfNet', () => {
  it('is the same over the open shares, the pairs and the simplified debts', () => {
    const open = openShares(
      [
        bill('dinner', 'me', { me: 30, ana: 30, ben: 30 }),
        bill('taxi', 'ana', { me: 10.1, ana: 10, ben: 10 }),
        bill('hotel', 'ben', { me: 100, ana: 100, ben: 100 }, { currency: 'USD' }),
      ],
      [],
    );
    const expected = {
      involved: true,
      byCurrency: [
        { currency: 'MYR', amount: 49.9 },
        { currency: 'USD', amount: -100 },
      ],
    };
    expect(selfNet(open, 'me', 'MYR')).toEqual(expected);
    expect(selfNet(pairwiseDebts(open), 'me', 'MYR')).toEqual(expected);
    expect(selfNet(simplifyDebts(open), 'me', 'MYR')).toEqual(expected);
  });

  it('puts the reporting currency first', () => {
    const open = openShares(
      [
        bill('a', 'me', { ana: 5 }, { currency: 'EUR' }),
        bill('b', 'me', { ana: 7 }, { currency: 'USD' }),
      ],
      [],
    );
    expect(selfNet(open, 'me', 'USD').byCurrency.map((net) => net.currency)).toEqual([
      'USD',
      'EUR',
    ]);
  });

  it('counts what is owed back on a deleted bill', () => {
    const open = openShares(
      [bill('dinner', 'me', { ana: 40 }, { deletedAt: at })],
      [payment('dinner', 'ana', 'me', 40)],
    );
    expect(selfNet(open, 'me', 'MYR')).toEqual({
      involved: true,
      byCurrency: [{ currency: 'MYR', amount: -40 }],
    });
  });

  it('is involved but even when what the user owes and is owed cancel out', () => {
    const debts = [
      { from: 'ana', to: 'me', currency: 'MYR', amount: 10 },
      { from: 'me', to: 'ben', currency: 'MYR', amount: 10 },
    ];
    expect(selfNet(debts, 'me', 'MYR')).toEqual({ involved: true, byCurrency: [] });
  });

  it('leaves out other people’s debts, and a user with no member yet', () => {
    const debts = [{ from: 'ana', to: 'ben', currency: 'MYR', amount: 10 }];
    expect(selfNet(debts, 'me', 'MYR').involved).toBe(false);
    expect(selfNet(debts, null, 'MYR').involved).toBe(false);
  });
});
