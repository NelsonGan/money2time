import { suggestCategoryEmoji } from '~/utils/categoryEmojiMatcher';

describe('suggestCategoryEmoji', () => {
  it.each([
    ['rent', '🏠'],
    ['Flight to Tokyo', '✈️'],
    ['Vacation Trip', '🧳'],
    ['Uber ride', '🚗'],
    ['Groceries at Costco', '🛒'],
    ['Pizza Hut', '🍕'],
    ['Coffee', '☕'],
    ['beer with friends', '🍺'],
    ['dinner', '🍔'],
    ['doctor visit', '🏥'],
    ['pharmacy refill', '💊'],
    ['baby formula', '👶'],
    ['dog walker', '🐶'],
    ['gym membership', '🏋️'],
    ['xbox game', '🎮'],
    ['Movie night', '🎬'],
    ['ebook purchase', '📚'],
    ['college tuition', '🎓'],
    ['new shirt', '👕'],
    ['electricity bill', '💡'],
    ['mobile phone bill', '📱'],
    ['monthly subscription fee', '🔁'],
    ['monthly salary', '💰'],
    ['stock dividend', '📈'],
    ['credit card payment', '🏦'],
    ['VAT refund', '🧾'],
    ['shopping at Amazon', '🛍️'],
    ['birthday gift', '🎁'],
    ['office supplies', '💼'],
    ['laundry detergent', '🧼'],
  ])('matches %s → %s', (input, expected) => {
    expect(suggestCategoryEmoji(input)).toBe(expected);
  });

  it('returns null for empty/whitespace input', () => {
    expect(suggestCategoryEmoji('')).toBeNull();
    expect(suggestCategoryEmoji('   ')).toBeNull();
  });

  it('returns null when there is no matching pattern', () => {
    expect(suggestCategoryEmoji('zzzzzzzz')).toBeNull();
  });

  it('matches non-English keywords (Chinese)', () => {
    expect(suggestCategoryEmoji('房租')).toBe('🏠');
    expect(suggestCategoryEmoji('机票')).toBe('✈️');
  });
});
