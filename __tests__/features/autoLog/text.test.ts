import { containsWords, normalizeAlertText } from '~/features/autoLog/lib/text';

it('normalizes notification markup, spacing and full-width characters for duplicate matching', () => {
  expect(normalizeAlertText(['<b>Paid</b>\r\nＲＭ２５.００', '  Cafe\tKL  ']).lower).toBe(
    'paid\nrm25.00\ncafe kl',
  );
});
it('matches user-defined phrases without matching parts of another word', () => {
  expect(containsWords('parking fee rm2', 'Parking')).toBe(true);
  expect(containsWords('cashbacks are available', 'cashback')).toBe(false);
});
it('normalizes full-width user-defined ignore phrases in the same way as notification text', () => {
  expect(
    containsWords(normalizeAlertText(['ＣＡＳＨＢＡＣＫ credited']).lower, 'ＣＡＳＨＢＡＣＫ'),
  ).toBe(true);
});
it('keeps distinct long notifications distinct beyond the old parser cutoff', () => {
  expect(normalizeAlertText(['x'.repeat(2500) + ' first']).lower).not.toBe(
    normalizeAlertText(['x'.repeat(2500) + ' second']).lower,
  );
});
