import {
  billChangeBlock,
  billHasPayments,
  canRecordPayment,
  ownsBill,
} from '~/features/albums/lib/groupRules';

describe('shared album rules', () => {
  it('gives a bill to its payer alone', () => {
    expect(ownsBill('me', { paidBy: 'me' })).toBe(true);
    expect(ownsBill('me', { paidBy: 'aisha' })).toBe(false);
  });

  it('locks a bill while a payment stands on it', () => {
    const payments = [
      { expenseId: 'dinner', fromMember: 'aisha', toMember: 'me' },
      { expenseId: 'lunch', fromMember: 'aisha', toMember: 'me', deletedAt: '2026-11-13' },
    ];
    expect(billHasPayments(payments, 'dinner')).toBe(true);
    expect(billHasPayments(payments, 'lunch')).toBe(false);
    expect(billChangeBlock('me', { paidBy: 'me' }, payments, 'dinner')).toBe('has_payments');
    expect(billChangeBlock('me', { paidBy: 'me' }, payments, 'lunch')).toBeNull();
    expect(billChangeBlock('me', { paidBy: 'aisha' }, [], 'tea')).toBe('not_payer');
  });

  it('lets only the person paying record or undo a payment, or its receiver once the payer left', () => {
    const members = [
      { id: 'me', userId: 'u-me' },
      { id: 'aisha', userId: 'u-aisha' },
      // Left the album.
      { id: 'ben', userId: null },
    ];
    expect(canRecordPayment(members, 'me', 'me', 'aisha')).toBe(true);
    expect(canRecordPayment(members, 'me', 'aisha', 'me')).toBe(false);
    expect(canRecordPayment(members, 'me', 'ben', 'me')).toBe(true);
    expect(canRecordPayment(members, 'me', 'ben', 'aisha')).toBe(false);
  });
});
