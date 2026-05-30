import {
  parseQuickInput,
  stripCurrencyTokens,
} from '~/features/transactions/utils/parseQuickInput';

describe('stripCurrencyTokens', () => {
  it.each([
    ['$ pizza', 'pizza'],
    ['Nasi Lemak RM', 'Nasi Lemak'],
    ['霸王茶姬 ¥', '霸王茶姬'],
    ['HK$', ''],
    ['coffee €', 'coffee'],
    ['rm teh tarik', 'teh tarik'],
    ['lunch with friends', 'lunch with friends'],
  ])('strips %p -> %p', (input, expected) => {
    expect(stripCurrencyTokens(input)).toBe(expected);
  });

  it('does not gut words that merely contain a currency code', () => {
    expect(stripCurrencyTokens('rmt drinks')).toBe('rmt drinks');
  });
});

describe('voice note = parseQuickInput + stripCurrencyTokens', () => {
  it.each<[string, string, number]>([
    ['Nasi Lemak RM20', 'Nasi Lemak', 20],
    ['$30 pizza', 'pizza', 30],
    ['霸王茶姬 ¥16.90', '霸王茶姬', 16.9],
    ['coffee 5', 'coffee', 5],
  ])('%p -> note %p, amount %p', (raw, expectedNote, expectedAmount) => {
    const parsed = parseQuickInput(raw);
    expect(parsed.amount).toBe(expectedAmount);
    expect(stripCurrencyTokens(parsed.note)).toBe(expectedNote);
  });
});
