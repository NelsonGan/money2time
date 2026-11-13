import {
  billChangeBlock,
  billHasPayments,
  canBePayer,
  canRecordPayment,
  ownsBill,
} from '~/features/albums/lib/groupRules';

const members = [
  { id: 'me', userId: 'u-me' },
  { id: 'aisha', userId: 'u-aisha' },
  // On the list, not joined.
  { id: 'ben', userId: null },
];

describe('shared album rules', () => {
  it('lets the user name only themselves or someone who has not joined as payer', () => {
    expect(canBePayer(members, 'me', 'me')).toBe(true);
    expect(canBePayer(members, 'me', 'ben')).toBe(true);
    expect(canBePayer(members, 'me', 'aisha')).toBe(false);
  });

  it('gives a bill to its payer, and a bill someone who has not joined paid to everyone', () => {
    expect(ownsBill(members, 'me', { paidBy: 'me' })).toBe(true);
    expect(ownsBill(members, 'me', { paidBy: 'aisha' })).toBe(false);
    expect(ownsBill(members, 'me', { paidBy: 'ben' })).toBe(true);
  });

  it('locks a bill while a payment stands on it', () => {
    const payments = [
      { expenseId: 'dinner', fromMember: 'aisha', toMember: 'me' },
      { expenseId: 'lunch', fromMember: 'aisha', toMember: 'me', deletedAt: '2026-11-13' },
    ];
    expect(billHasPayments(payments, 'dinner')).toBe(true);
    expect(billHasPayments(payments, 'lunch')).toBe(false);
    expect(billChangeBlock(members, 'me', { paidBy: 'me' }, payments, 'dinner')).toBe(
      'has_payments',
    );
    expect(billChangeBlock(members, 'me', { paidBy: 'me' }, payments, 'lunch')).toBeNull();
    expect(billChangeBlock(members, 'me', { paidBy: 'aisha' }, [], 'tea')).toBe('not_payer');
  });

  it('lets only the person paying record a payment, or its receiver when the payer has not joined', () => {
    expect(canRecordPayment(members, 'me', 'me', 'aisha')).toBe(true);
    expect(canRecordPayment(members, 'me', 'aisha', 'me')).toBe(false);
    expect(canRecordPayment(members, 'me', 'ben', 'me')).toBe(true);
    // Between two others: never the user's to record.
    expect(canRecordPayment(members, 'me', 'ben', 'aisha')).toBe(false);
  });
});
