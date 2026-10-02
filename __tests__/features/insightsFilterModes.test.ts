import {
  categoryFilterIds,
  filterModeOf,
  parseInsightsFilterModes,
} from '~/features/insights/insightsFilterModes';

describe('insights filter modes', () => {
  it('reads a missing row as exclude', () => {
    expect(filterModeOf({}, 'expenseTrendAccounts')).toBe('exclude');
    expect(filterModeOf({ expenseTrendAccounts: 'include' }, 'expenseTrendAccounts')).toBe(
      'include',
    );
  });

  it('keeps only known rows flipped to include', () => {
    expect(
      parseInsightsFilterModes({
        expenseTrendAccounts: 'include',
        savingsIncomeCategories: 'exclude',
        notARow: 'include',
        incomeBreakdownCategories: 'only',
      }),
    ).toEqual({ expenseTrendAccounts: 'include' });
  });

  it('ignores anything that is not an object', () => {
    expect(parseInsightsFilterModes(undefined)).toBeUndefined();
    expect(parseInsightsFilterModes(['include'])).toBeUndefined();
    expect(parseInsightsFilterModes('include')).toBeUndefined();
  });
});

describe('categoryFilterIds', () => {
  const categoryById = new Map([
    ['food', { parentId: null }],
    ['groceries', { parentId: 'food' }],
  ]);

  it('matches a row on its category and that category’s parent', () => {
    expect(categoryFilterIds('groceries', categoryById)).toEqual(['groceries', 'food']);
    expect(categoryFilterIds('food', categoryById)).toEqual(['food', null]);
  });

  it('gives an uncategorized row nothing to match', () => {
    expect(categoryFilterIds(null, categoryById)).toEqual([]);
  });
});
