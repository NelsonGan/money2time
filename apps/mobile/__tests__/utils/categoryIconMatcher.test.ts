import { CATEGORY_ICON_SOURCES } from '~/constants/categoryIcons';
import { CATEGORY_ICON_PATTERNS, suggestCategoryIcon } from '~/utils/categoryIconMatcher';

describe('suggestCategoryIcon', () => {
  it.each([
    ['rent', 'house'],
    ['Flight to Tokyo', 'plane'],
    ['Vacation Trip', 'camper-van'],
    ['Uber ride', 'car'],
    ['Groceries at Costco', 'grocery-basket'],
    // No pizza artwork exists, so the pizza pattern collapses into the generic
    // meal icon. Deliberate: routing the suggester back through the legacy
    // emoji table to keep them distinct would reintroduce the indirection.
    ['Pizza Hut', 'meal'],
    ['Coffee', 'coffee'],
    ['beer with friends', 'alcohol'],
    ['dinner', 'meal'],
    ['doctor visit', 'stethoscope'],
    ['pharmacy refill', 'medicine'],
    ['baby formula', 'balloon'],
    ['dog walker', 'dog'],
    ['gym membership', 'dumbbell'],
    ['xbox game', 'game-controller'],
    ['Movie night', 'clapperboard'],
    ['ebook purchase', 'graduation-cap'],
    ['college tuition', 'graduation-cap'],
    ['new shirt', 't-shirt'],
    ['electricity bill', 'light-bulb'],
    ['mobile phone bill', 'laptop'],
    ['monthly subscription fee', 'bill-calendar'],
    ['monthly salary', 'cash'],
    ['stock dividend', 'coins'],
    ['credit card payment', 'bank'],
    ['VAT refund', 'invoice'],
    ['shopping at Amazon', 'shopping-bag'],
    ['birthday gift', 'gift'],
    ['office supplies', 'briefcase'],
    ['laundry detergent', 'faucet'],
  ])('matches %s → %s', (input, expected) => {
    expect(suggestCategoryIcon(input)).toBe(expected);
  });

  it('returns null for empty/whitespace input', () => {
    expect(suggestCategoryIcon('')).toBeNull();
    expect(suggestCategoryIcon('   ')).toBeNull();
  });

  it('returns null when there is no matching pattern', () => {
    expect(suggestCategoryIcon('zzzzzzzz')).toBeNull();
  });

  it('matches non-English keywords (Chinese)', () => {
    expect(suggestCategoryIcon('房租')).toBe('house');
    expect(suggestCategoryIcon('机票')).toBe('plane');
  });

  it('only ever suggests a bundled icon id', () => {
    // A suggestion the picker cannot show as selected is a broken suggestion,
    // so every pattern's icon must exist in the bundled set.
    for (const { icon } of CATEGORY_ICON_PATTERNS) {
      expect(CATEGORY_ICON_SOURCES[icon]).toBeDefined();
    }
  });
});
