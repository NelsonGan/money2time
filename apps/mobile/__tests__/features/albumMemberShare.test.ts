import type { AlbumGroupPerson } from '~/features/albums/lib/albumPeople';
import { breakdownMemberOptions, memberShare } from '~/features/albums/lib/memberShare';
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
    albumMemberId: null,
    settlementId: null,
    sortOrder: 0,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const aisha = { kind: 'person', id: 'p-aisha', name: 'Aisha' } as const;
const ben = { kind: 'person', id: 'p-ben', name: 'Ben' } as const;
const self = { kind: 'self' } as const;

describe('memberShare', () => {
  it('counts an entry that is not split as the user’s own, and nobody else’s', () => {
    const entry = { amount: 42 };
    expect(memberShare(entry, self)).toBe(42);
    expect(memberShare(entry, aisha)).toBe(0);
  });

  it('splits a bill the user paid by its rows', () => {
    const entry = {
      amount: 90,
      splits: [
        makeSplit({ id: 'me', isSelf: true, personName: 'Me', amount: 30 }),
        makeSplit({ id: 'a', albumMemberId: 'p-aisha', amount: 30 }),
        makeSplit({ id: 'b', personName: 'Ben', amount: 30 }),
      ],
    };
    expect(memberShare(entry, self)).toBe(30);
    expect(memberShare(entry, aisha)).toBe(30);
    // Typed on the bill, matched by name.
    expect(memberShare(entry, ben)).toBe(30);
  });

  it('keeps a friend’s part payments in their share', () => {
    const entry = {
      amount: 70,
      splits: [
        makeSplit({ id: 'me', isSelf: true, amount: 30 }),
        makeSplit({ id: 'a', albumMemberId: 'p-aisha', amount: 20 }),
        makeSplit({
          id: 'a-part',
          albumMemberId: 'p-aisha',
          amount: 10,
          partOfSplitId: 'a',
          paidAt: '2026-11-06T00:00:00.000Z',
        }),
      ],
    };
    expect(memberShare(entry, aisha)).toBe(30);
  });

  it('reads shares from shareAmount on a bill a friend paid, leaving out the user’s paybacks', () => {
    const entry = {
      amount: 20,
      splits: [
        makeSplit({ id: 'me', isSelf: true, amount: 20 }),
        makeSplit({ id: 'a', albumMemberId: 'p-aisha', isPayer: true, shareAmount: 30 }),
        makeSplit({
          id: 'a-part',
          albumMemberId: 'p-aisha',
          partOfSplitId: 'a',
          shareAmount: 10,
          paidAt: '2026-11-06T00:00:00.000Z',
        }),
        makeSplit({ id: 'b', albumMemberId: 'p-ben', personName: 'Ben', shareAmount: 30 }),
      ],
    };
    expect(memberShare(entry, self)).toBe(20);
    expect(memberShare(entry, aisha)).toBe(30);
    expect(memberShare(entry, ben)).toBe(30);
  });
});

it('falls back to the expense for the user on a bill a friend paid with no Me row', () => {
  const entry = {
    amount: 25,
    splits: [makeSplit({ id: 'a', albumMemberId: 'p-aisha', isPayer: true, shareAmount: 25 })],
  };
  expect(memberShare(entry, self)).toBe(25);
  // A bill the user paid with no Me row: nothing of it is theirs.
  expect(memberShare({ amount: 50, splits: [makeSplit({ id: 'b', amount: 50 })] }, self)).toBe(0);
});

describe('breakdownMemberOptions', () => {
  const people: AlbumGroupPerson[] = [
    { id: null, name: 'Nelson', isSelf: true, joined: true },
    { id: 'p-aisha', name: 'Aisha', isSelf: false, joined: false },
  ];

  it('is empty while no bill is split', () => {
    expect(breakdownMemberOptions(people, [{ amount: 10 }], 'Nelson')).toEqual([]);
  });

  it('lists the user, the album’s people, then other names on its bills', () => {
    const entries = [
      {
        amount: 90,
        splits: [
          makeSplit({ id: 'me', isSelf: true, amount: 30 }),
          makeSplit({ id: 'a', albumMemberId: 'p-aisha', amount: 30 }),
          makeSplit({ id: 'b', personName: ' Ben ', amount: 30 }),
          makeSplit({ id: 'b2', personName: 'ben', amount: 0 }),
        ],
      },
    ];
    expect(breakdownMemberOptions(people, entries, 'Nelson').map((o) => o.name)).toEqual([
      'Nelson',
      'Aisha',
      'Ben',
    ]);
  });
});
