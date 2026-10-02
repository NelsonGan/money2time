import {
  isSelectionFilterMode,
  passesSelectionFilter,
  toSelectionFilterMode,
} from '~/utils/selectionFilter';

describe('passesSelectionFilter', () => {
  const picked = new Set(['a', 'b']);

  it('passes everything when nothing is picked, in either mode', () => {
    expect(passesSelectionFilter('exclude', new Set(), ['a'])).toBe(true);
    expect(passesSelectionFilter('include', new Set(), ['a'])).toBe(true);
    expect(passesSelectionFilter('include', new Set(), [])).toBe(true);
  });

  it('exclude drops a row when any of its ids was picked', () => {
    expect(passesSelectionFilter('exclude', picked, ['x', 'b'])).toBe(false);
    expect(passesSelectionFilter('exclude', picked, ['x', null])).toBe(true);
  });

  it('include keeps a row only when one of its ids was picked', () => {
    expect(passesSelectionFilter('include', picked, [null, 'a'])).toBe(true);
    expect(passesSelectionFilter('include', picked, ['x', undefined])).toBe(false);
  });

  it('a row with no ids survives an exclusion but not an inclusion', () => {
    expect(passesSelectionFilter('exclude', picked, [])).toBe(true);
    expect(passesSelectionFilter('include', picked, [])).toBe(false);
  });
});

describe('selection filter mode parsing', () => {
  it('accepts only the two modes and defaults to exclude', () => {
    expect(isSelectionFilterMode('include')).toBe(true);
    expect(isSelectionFilterMode('only')).toBe(false);
    expect(toSelectionFilterMode('include')).toBe('include');
    expect(toSelectionFilterMode(undefined)).toBe('exclude');
  });
});
