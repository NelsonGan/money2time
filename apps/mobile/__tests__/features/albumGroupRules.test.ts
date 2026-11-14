import {
  billHasPayments,
  billPeople,
  canEditGroup,
  isCurrentMember,
} from '~/features/albums/lib/groupRules';

// Who may do what in a shared album (README: Album members and shared albums
// > Anyone in it can change it). The Worker keeps the same rules; these are
// what the screens offer.

const members = [
  { id: 'me', userId: 'u-me' },
  { id: 'aisha', userId: 'u-aisha' },
  // Left the album: their row and bills stay.
  { id: 'ben', userId: null },
];

describe('anyone in the album can change it', () => {
  it('lets everyone still in it change anything, and nobody who left', () => {
    expect(canEditGroup(members, 'u-me')).toBe(true);
    expect(canEditGroup(members, 'u-aisha')).toBe(true);
    expect(canEditGroup(members, 'u-ben')).toBe(false);
    expect(canEditGroup(members, null)).toBe(false);
    expect(canEditGroup([{ id: 'me', userId: 'u-me', deletedAt: 'x' }], 'u-me')).toBe(false);
  });

  it('puts only people still in it on a bill, and keeps whoever is already on it', () => {
    expect(isCurrentMember(members[2])).toBe(false);
    expect(billPeople(members).map((member) => member.id)).toEqual(['me', 'aisha']);
    expect(billPeople(members, ['ben']).map((member) => member.id)).toEqual(['me', 'aisha', 'ben']);
  });

  it('asks before a bill with payments changes, and only then', () => {
    const payments = [
      { expenseId: 'dinner', deletedAt: null },
      { expenseId: 'lunch', deletedAt: '2026-11-13T00:00:00.000Z' },
    ];
    expect(billHasPayments(payments, 'dinner')).toBe(true);
    expect(billHasPayments(payments, 'lunch')).toBe(false);
    expect(billHasPayments(payments, 'taxi')).toBe(false);
  });
});
