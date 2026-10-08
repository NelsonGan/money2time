import {
  extractNotificationAmounts,
  parseNotificationReviewAmount,
} from '~/utils/notificationAmounts';

it('extracts a fractional RM amount without inferring income or expense', () => {
  expect(
    extractNotificationAmounts('You have successfully transferred RM 0.20 to ALEX TAN.', 'MYR'),
  ).toEqual([{ amount: 0.2, currency: 'MYR' }]);
});
it.each([
  ['EUR 1.234,56', 'EUR', 1234.56],
  ['₹1,23,456.78', 'INR', 123456.78],
  ['1 234,56 EUR', 'EUR', 1234.56],
  ['KWD 1.250', 'KWD', 1.25],
  ['JPY 1,250', 'JPY', 1250],
  ['$5.20', 'MYR', 5.2],
  ['rm0.20', 'MYR', 0.2],
])('reads regional currency amounts: %s', (text, currency, amount) => {
  expect(extractNotificationAmounts(text, 'MYR')).toEqual([{ amount, currency }]);
});
it('keeps payment, balance and promotional amounts as candidates for the user to choose', () => {
  expect(
    extractNotificationAmounts('Payment RM25.00. Balance RM900.00. Get RM5 cashback.', 'MYR'),
  ).toEqual([
    { amount: 25, currency: 'MYR' },
    { amount: 900, currency: 'MYR' },
    { amount: 5, currency: 'MYR' },
  ]);
});
it('never treats card identifiers, OTPs, dates or reference numbers as amounts', () => {
  expect(
    extractNotificationAmounts('Card 1234, OTP 123456, ref 99999, 2026-10-08 10:57', 'MYR'),
  ).toEqual([]);
});
it('keeps a repeated amount once, but distinct currencies separately', () => {
  expect(extractNotificationAmounts('RM5.00, MYR 5.00, USD5.00', 'MYR')).toEqual([
    { amount: 5, currency: 'MYR' },
    { amount: 5, currency: 'USD' },
  ]);
});
it('rejects zero, negative, invalid and overly large amounts', () => {
  expect(extractNotificationAmounts('RM0.00 RM-5.00 RM99999999999999999', 'MYR')).toEqual([]);
});
it('does not silently pluck part of an invalid precision', () => {
  expect(extractNotificationAmounts('MYR 1.2345', 'MYR')).toEqual([]);
});

it('validates editable amounts without interpreting extra decimals as thousands', () => {
  expect(parseNotificationReviewAmount('1.234', 'MYR')).toBeNull();
  expect(parseNotificationReviewAmount('1.234', 'KWD')).toEqual({ amount: 1.234, currency: 'KWD' });
  expect(parseNotificationReviewAmount('0.001', 'KWD')).toEqual({ amount: 0.001, currency: 'KWD' });
  expect(parseNotificationReviewAmount('0.20', 'MYR')).toEqual({ amount: 0.2, currency: 'MYR' });
  expect(parseNotificationReviewAmount('12,50', 'EUR')).toEqual({ amount: 12.5, currency: 'EUR' });
});
it('rejects malformed mixed grouping instead of guessing the amount', () => {
  expect(extractNotificationAmounts('RM 1,234.567.89 RM 1,234,56', 'MYR')).toEqual([]);
});
