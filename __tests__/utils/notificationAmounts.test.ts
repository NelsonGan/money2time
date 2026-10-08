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

it.each([
  ['Transferred 0.20 to ALEX TAN.', 'MYR', 0.2],
  ['500 debited from your wallet.', 'INR', 500],
  ['Payment 1.234,56 completed.', 'EUR', 1234.56],
  ['Payment 1\u202f234,56 completed.', 'EUR', 1234.56],
  ['Payment 0.001 completed.', 'KWD', 0.001],
  ['Payment د.إ 25.50 completed.', 'AED', 25.5],
  ['تم الدفع ١٢٫٥٠', 'AED', 12.5],
])('reads amounts without requiring a known currency token: %s', (text, currency, amount) => {
  expect(extractNotificationAmounts(text, currency)).toEqual([{ amount, currency }]);
});
it('keeps unlabelled payment and balance candidates without including IDs or times', () => {
  expect(
    extractNotificationAmounts(
      'Card ending in 1234: Payment 25.00. Balance 900.00. Ref: 99999 at 10:57 on 2026-10-08.',
      'MYR',
    ),
  ).toEqual([
    { amount: 25, currency: 'MYR' },
    { amount: 900, currency: 'MYR' },
  ]);
});
it('does not add fallback-currency duplicates of explicit amounts or split invalid numbers', () => {
  expect(extractNotificationAmounts('USD5.00, payment 7.50', 'MYR')).toEqual([
    { amount: 5, currency: 'USD' },
    { amount: 7.5, currency: 'MYR' },
  ]);
  expect(extractNotificationAmounts('Payment 1,234,56. Ref ABC1234, 10% offer.', 'MYR')).toEqual(
    [],
  );
});
it('rejects negative numbers and scientific notation without plucking a numeric tail', () => {
  expect(
    extractNotificationAmounts('Payment - 5.00, -10.00, 0.00, 1e3, 1E+3 or 1E-3.', 'MYR'),
  ).toEqual([]);
});
it('accepts common colon and credit-plus formatting while excluding labelled phone numbers', () => {
  expect(
    extractNotificationAmounts('Amount: 25.00. Credited +14.50. Phone +60123456789.', 'MYR'),
  ).toEqual([
    { amount: 25, currency: 'MYR' },
    { amount: 14.5, currency: 'MYR' },
  ]);
});

it('keeps adjacent currency prefixes attached to their own numbers', () => {
  expect(extractNotificationAmounts('RM5.00 USD10.00', 'MYR')).toEqual([
    { amount: 5, currency: 'MYR' },
    { amount: 10, currency: 'USD' },
  ]);
  expect(extractNotificationAmounts('5.00 MYR 10.00 USD', 'MYR')).toEqual([
    { amount: 5, currency: 'MYR' },
    { amount: 10, currency: 'USD' },
  ]);
});

it('prefers an attached currency label over a neighbouring unlabelled balance', () => {
  expect(extractNotificationAmounts('Balance 900.00 USD25.00', 'MYR')).toEqual([
    { amount: 900, currency: 'MYR' },
    { amount: 25, currency: 'USD' },
  ]);
});

it.each([
  'Paid 12.50 using ****1234.',
  'Paid 12.50 using ••••1234.',
  'Paid 12.50. A/C 12345678.',
  'Paid 12.50. PIN is 1234. CVV: 123. Passcode 456789.',
])('excludes account and security identifiers from number-only candidates: %s', (text) => {
  expect(extractNotificationAmounts(text, 'MYR')).toEqual([{ amount: 12.5, currency: 'MYR' }]);
});

it('does not turn Unicode negative amounts into positive candidates', () => {
  expect(extractNotificationAmounts('Payment −5.00, RM−10.00, − 15.00.', 'MYR')).toEqual([]);
});
