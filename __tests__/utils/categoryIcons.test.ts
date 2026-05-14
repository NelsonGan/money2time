import { resolveCategoryIcon } from '~/utils/categoryIcons';

describe('resolveCategoryIcon', () => {
  it('returns the category icon when present', () => {
    expect(resolveCategoryIcon('🍔', '🛒', '🧾')).toBe('🍔');
  });

  it('falls back to the parent icon when own icon is missing', () => {
    expect(resolveCategoryIcon(null, '🛒', '🧾')).toBe('🛒');
    expect(resolveCategoryIcon('', '🛒', '🧾')).toBe('🛒');
    expect(resolveCategoryIcon('   ', '🛒', '🧾')).toBe('🛒');
  });

  it('falls back to the fallback when both are missing', () => {
    expect(resolveCategoryIcon(null, null, '🧾')).toBe('🧾');
  });

  it('defaults the fallback to an empty string', () => {
    expect(resolveCategoryIcon(null, null)).toBe('');
  });

  it('trims surrounding whitespace from the resolved icon', () => {
    expect(resolveCategoryIcon('  🍕  ')).toBe('🍕');
  });
});
