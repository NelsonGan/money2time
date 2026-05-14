import { cn } from '~/utils';

describe('cn (class name helper)', () => {
  it('joins string class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('filters out falsy entries', () => {
    expect(cn('a', null, false, undefined, 'b')).toBe('a b');
  });

  it('merges conflicting tailwind classes via twMerge', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('supports conditional objects', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b');
  });
});
