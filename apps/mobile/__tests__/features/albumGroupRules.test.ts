import {
  billChangeBlock,
  billHasPayments,
  canRecordPayment,
  canUndoPayment,
  ownsBill,
} from '~/features/albums/lib/groupRules';

describe('shared album rules', () => {
  it('lets only the recorder undo a simplified payment, including its intermediate bills', () => {
    const members = [
      { id: 'me', userId: 'u-me' },
      { id: 'aisha', userId: 'u-aisha' },
      { id: 'ben', userId: 'u-ben' },
    ];
    // Aisha pays Ben along Aisha -> me -> Ben. Both rows are one payment.
    const payment = { fromMember: 'me', toMember: 'ben', createdBy: 'u-aisha' };
    expect(canUndoPayment(members, 'me', payment)).toBe(false);
    expect(canUndoPayment(members, 'aisha', payment)).toBe(true);
    expect(canUndoPayment(members, 'ben', payment)).toBe(false);
    expect(canUndoPayment(members, 'missing', payment)).toBe(false);
  });

  it('keeps undo with its recorder if a departed payer rejoins, with legacy fallback', () => {
    const members = [
      { id: 'me', userId: 'u-me' },
      { id: 'ben', userId: 'u-ben' },
    ];
    const payment = { fromMember: 'ben', toMember: 'me', createdBy: 'u-me' };
    expect(canUndoPayment(members, 'me', payment)).toBe(true);
    expect(canUndoPayment(members, 'ben', payment)).toBe(false);
    expect(canUndoPayment(members, 'ben', { ...payment, createdBy: null })).toBe(true);
    expect(canUndoPayment(members, 'me', { ...payment, createdBy: null })).toBe(false);
  });

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
