import { billFromRows, groupTotals, localBill, ownSide } from '~/features/albums/lib/albumGroup';
import {
  albumPeople,
  memberForRow,
  selfMember,
  splitWithPeople,
  uniquePersonName,
  withPersonAdded,
  withPersonRenamed,
} from '~/features/albums/lib/albumPeople';
import { toAlbumMember, toAlbumSettlement } from '~/lib/repositories/mappers';
import type { AlbumExpense, AlbumMember, AlbumSettlement } from '~/types';

const at = '2026-11-12T00:00:00.000Z';

function bill(overrides: Partial<AlbumExpense> = {}): AlbumExpense {
  return {
    id: 'dinner',
    groupId: 'bali',
    date: '2026-11-12',
    note: 'Dinner',
    amount: 90,
    currency: 'MYR',
    categoryName: 'Food',
    categoryIcon: '🍽️',
    paidBy: 'me',
    shares: [
      { memberId: 'me', amount: 30 },
      { memberId: 'aisha', amount: 30 },
      { memberId: 'ben', amount: 30 },
    ],
    createdBy: 'u-me',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

function payment(overrides: Partial<AlbumSettlement> = {}): AlbumSettlement {
  return {
    id: 's1',
    groupId: 'bali',
    expenseId: 'dinner',
    fromMember: 'aisha',
    toMember: 'me',
    amount: 30,
    currency: 'MYR',
    date: '2026-11-13',
    createdBy: 'u-aisha',
    createdAt: '2026-11-13T08:00:00.000Z',
    updatedAt: '2026-11-13T08:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function member(id: string, name: string, userId: string | null = null): AlbumMember {
  return {
    id,
    groupId: 'bali',
    name,
    userId,
    sortOrder: 0,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

describe('album people', () => {
  it('adds and renames people by a clean, unique name', () => {
    const one = withPersonAdded([], '  Aisha   Tan ', 'a');
    expect(one).toEqual([{ id: 'a', name: 'Aisha Tan' }]);
    const people = one as { id: string; name: string }[];
    expect(withPersonAdded(people, 'aisha tan', 'b')).toBe('taken');
    expect(withPersonAdded(people, '   ', 'b')).toBe('blank');
    expect(withPersonRenamed(people, 'a', 'Aisha')).toEqual([{ id: 'a', name: 'Aisha' }]);
    expect(withPersonRenamed([...people, { id: 'b', name: 'Ben' }], 'b', 'AISHA TAN')).toBe(
      'taken',
    );
  });

  it('lists the user first, from the album or from the group', () => {
    const album = { splitWith: [{ id: 'a', name: 'Aisha' }] };
    expect(albumPeople(album, null, null, 'Me')).toEqual([
      { id: null, name: 'Me', isSelf: true, joined: true },
      { id: 'a', name: 'Aisha', isSelf: false, joined: false },
    ]);
    const members = [member('aisha', 'Aisha', 'u-aisha'), member('me', 'Nelson', 'u-me')];
    const people = albumPeople(album, members, 'u-me', 'Me');
    expect(people.map((person) => [person.id, person.name, person.isSelf, person.joined])).toEqual([
      ['me', 'Me', true, true],
      ['aisha', 'Aisha', false, true],
    ]);
    expect(splitWithPeople(people)).toEqual([{ id: 'aisha', name: 'Aisha' }]);
    expect(selfMember(members, 'u-me')?.id).toBe('me');
    expect(selfMember(members, null)).toBeNull();
  });

  it('finds who a row of a bill is by its member, then by name', () => {
    const members = [member('aisha', 'Aisha', 'u-aisha'), member('me', 'Nelson', 'u-me')];
    expect(memberForRow(members, 'me', { personName: ' aisha ' })?.id).toBe('aisha');
    expect(memberForRow(members, 'me', { albumMemberId: 'aisha', personName: 'A' })?.id).toBe(
      'aisha',
    );
    // The user's own name, or their own member, is never someone else.
    expect(memberForRow(members, 'me', { personName: 'Nelson' })).toBeNull();
    expect(memberForRow(members, 'me', { albumMemberId: 'me', personName: 'Ben' })).toBeNull();
    expect(uniquePersonName('Ben', members)).toBe('Ben');
    expect(uniquePersonName('aisha', members)).toBe('aisha 2');
    // Never past the longest name a group keeps, or it reads back as the taken one.
    const long = 'A'.repeat(40);
    const named = uniquePersonName(long, [member('x', long)]);
    expect(named).toHaveLength(40);
    expect(named.endsWith(' 2')).toBe(true);
  });
});

describe('a group bill from the split editor', () => {
  it('names the payer and folds a member with several rows', () => {
    expect(
      billFromRows(
        [
          { memberId: 'me', amount: 30 },
          { memberId: 'aisha', amount: 20 },
          { memberId: 'aisha', amount: 10 },
          { memberId: 'ben', amount: 30, isPayer: true },
          { memberId: 'chen', amount: 0 },
        ],
        'me',
      ),
    ).toEqual({
      paidBy: 'ben',
      amount: 90,
      shares: [
        { memberId: 'me', amount: 30 },
        { memberId: 'aisha', amount: 30 },
        { memberId: 'ben', amount: 30 },
      ],
    });
    expect(billFromRows([{ memberId: 'me', amount: 0 }], 'me')).toBeNull();
  });
});

describe('one member’s own side of a bill', () => {
  it('is the whole bill for the payer and their share for the others', () => {
    expect(ownSide(bill(), 'me')).toEqual({
      kind: 'paid',
      total: 90,
      selfShare: 30,
      others: [
        { memberId: 'aisha', amount: 30 },
        { memberId: 'ben', amount: 30 },
      ],
    });
    expect(ownSide(bill(), 'aisha')).toEqual({
      kind: 'owes',
      selfShare: 30,
      payer: { memberId: 'me', amount: 30 },
      others: [{ memberId: 'ben', amount: 30 }],
    });
    expect(ownSide(bill(), 'chen')).toEqual({ kind: 'none' });
    expect(ownSide(bill(), null)).toEqual({ kind: 'none' });
  });

  it('a payment in another currency than its bill is not a payment on it', () => {
    const local = localBill(bill(), [payment({ amount: 10, currency: 'USD' })], 'me')!;
    expect(local.amount).toBe(90);
    expect(local.payments).toEqual([]);
  });

  it('a bill the user paid drops by what the others paid back', () => {
    const local = localBill(bill(), [payment({ amount: 10 })], 'me')!;
    expect(local.kind).toBe('paid');
    expect(local.amount).toBe(80);
    const aisha = local.splits.filter((row) => row.memberId === 'aisha');
    // What is left on the share's own row, the part beside it.
    expect(aisha.map((row) => [row.role, row.amount, row.settlementId])).toEqual([
      ['member', 20, null],
      ['payment', 10, 's1'],
    ]);
    expect(local.payments).toEqual([
      {
        settlementId: 's1',
        memberId: 'aisha',
        amount: 10,
        paidAt: '2026-11-13T08:00:00.000Z',
        date: '2026-11-13',
        kind: 'received',
      },
    ]);
  });

  it('the last payment of a share is the share’s own row', () => {
    const local = localBill(
      bill(),
      [
        payment({ id: 's1', amount: 10 }),
        payment({ id: 's2', amount: 20, createdAt: '2026-11-14T08:00:00.000Z' }),
      ],
      'me',
    )!;
    expect(local.amount).toBe(60);
    const aisha = local.splits.filter((row) => row.memberId === 'aisha');
    expect(aisha.map((row) => [row.role, row.amount, row.settlementId, !!row.paidAt])).toEqual([
      ['member', 20, 's2', true],
      ['payment', 10, 's1', true],
    ]);
  });

  it('ignores an undone payment, one for another bill, and what is past the share', () => {
    const local = localBill(
      bill(),
      [
        payment({ id: 'undone', deletedAt: at }),
        payment({ id: 'other', expenseId: 'taxi' }),
        payment({ id: 'big', amount: 45, createdAt: '2026-11-14T08:00:00.000Z' }),
        payment({ id: 'late', amount: 5, createdAt: '2026-11-15T08:00:00.000Z' }),
      ],
      'me',
    )!;
    expect(local.amount).toBe(60);
    expect(local.payments.map((item) => [item.settlementId, item.amount])).toEqual([['big', 30]]);
  });

  it('a bill someone else paid is the user’s share, then what is left of it', () => {
    const unpaid = localBill(bill(), [], 'aisha')!;
    expect(unpaid).toMatchObject({ kind: 'owes', amount: 30, payments: [] });
    expect(
      unpaid.splits.map((row) => [row.role, row.memberId, row.amount, row.shareAmount]),
    ).toEqual([
      ['self', null, 30, null],
      ['member', 'me', 0, 30],
      ['member', 'ben', 0, 30],
    ]);
    expect(unpaid.splits[1].isPayer).toBe(true);

    const part = localBill(
      bill(),
      [payment({ fromMember: 'aisha', toMember: 'me', amount: 12 })],
      'aisha',
    )!;
    expect(part).toMatchObject({ amount: 18 });
    expect(part.payments[0]).toMatchObject({ kind: 'sent_part', amount: 12 });
    expect(part.splits.at(-1)).toMatchObject({
      role: 'payment',
      partOf: 'me',
      amount: 0,
      shareAmount: 12,
      settlementId: 's1',
    });

    const paid = localBill(
      bill(),
      [
        payment({ id: 's1', amount: 12 }),
        payment({ id: 's2', amount: 18, createdAt: '2026-11-14T08:00:00.000Z' }),
      ],
      'aisha',
    )!;
    expect(paid).toMatchObject({ amount: 18 });
    expect(paid.payments.map((item) => item.kind)).toEqual(['sent_part', 'sent_final']);
    expect(paid.splits[1]).toMatchObject({ isPayer: true, settlementId: 's2' });
    expect(paid.splits[1].paidAt).toBe('2026-11-14T08:00:00.000Z');
  });

  it('is nothing for someone with no part in the bill', () => {
    expect(localBill(bill(), [], 'chen')).toBeNull();
  });
});

describe('the whole group', () => {
  it('totals what was spent and the user’s own share, per currency', () => {
    const expenses = [
      bill(),
      bill({
        id: 'taxi',
        amount: 40,
        paidBy: 'aisha',
        shares: [
          { memberId: 'me', amount: 20 },
          { memberId: 'aisha', amount: 20 },
        ],
      }),
      bill({ id: 'gone', deletedAt: at }),
      bill({
        id: 'sushi',
        currency: 'JPY',
        amount: 3000,
        paidBy: 'ben',
        shares: [
          { memberId: 'ben', amount: 1500 },
          { memberId: 'me', amount: 1500 },
        ],
      }),
    ];
    expect(Object.fromEntries(groupTotals(expenses, 'me'))).toEqual({
      MYR: { total: 130, selfPaid: 90, selfShare: 50 },
      JPY: { total: 3000, selfPaid: 0, selfShare: 1500 },
    });
  });
});

describe('a group row read from its database', () => {
  const memberRow = (id: string) => ({
    id,
    ledgerId: 'bali',
    name: 'Aisha',
    userId: null,
    sortOrder: 0,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });

  it('never takes `self`, the key of the user’s own row, as a member id', () => {
    expect(toAlbumMember(memberRow('aisha'))?.id).toBe('aisha');
    expect(toAlbumMember(memberRow('self'))).toBeNull();
  });

  it('takes a currency only as the app writes it, in capitals', () => {
    const row = { ...payment(), ledgerId: 'bali' };
    expect(toAlbumSettlement(row)?.currency).toBe('MYR');
    expect(toAlbumSettlement({ ...row, currency: 'myr' })).toBeNull();
  });
});
