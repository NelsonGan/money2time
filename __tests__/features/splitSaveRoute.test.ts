import type { SplitRowLike } from '~/features/transactions/lib/splitMath';
import { resolveSplitSaveRoute } from '~/features/transactions/lib/splitSaveRoute';

const me: SplitRowLike = { amount: '49.87', isSelf: true };
const friend: SplitRowLike = { amount: '39.44', isSelf: false };
const paidFriend: SplitRowLike = { amount: '39.44', isSelf: false, paid: { paidAt: '2026-10-06' } };

const base = {
  splitMode: true,
  type: 'expense',
  isRecurring: false,
  rows: [me, friend],
  hadPersistedSplits: false,
};

describe('resolveSplitSaveRoute', () => {
  it('saves the rows when an expense has a friend in it', () => {
    expect(resolveSplitSaveRoute(base)).toBe('splits');
    expect(resolveSplitSaveRoute({ ...base, hadPersistedSplits: true })).toBe('splits');
  });

  it('keeps a bill whose friends have all paid on the split path', () => {
    expect(resolveSplitSaveRoute({ ...base, rows: [me, paidFriend] })).toBe('splits');
  });

  it('clears persisted splits once every friend is removed', () => {
    // Done on an empty split page folds split mode off and empties the rows.
    expect(
      resolveSplitSaveRoute({ ...base, splitMode: false, rows: [], hadPersistedSplits: true }),
    ).toBe('clear');
    expect(resolveSplitSaveRoute({ ...base, rows: [me], hadPersistedSplits: true })).toBe('clear');
  });

  it('clears persisted splits when the transaction stops being an expense', () => {
    expect(
      resolveSplitSaveRoute({
        ...base,
        splitMode: false,
        type: 'income',
        hadPersistedSplits: true,
      }),
    ).toBe('clear');
  });

  it('saves plainly when there were never any splits', () => {
    expect(resolveSplitSaveRoute({ ...base, splitMode: false, rows: [] })).toBe('plain');
    expect(resolveSplitSaveRoute({ ...base, rows: [me] })).toBe('plain');
    expect(resolveSplitSaveRoute({ ...base, isRecurring: true })).toBe('plain');
    expect(resolveSplitSaveRoute({ ...base, isRecurring: true, hadPersistedSplits: true })).toBe(
      'plain',
    );
  });
});
