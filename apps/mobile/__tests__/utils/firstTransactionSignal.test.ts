import { createFirstTransactionSignal } from '~/utils/firstTransactionSignal';

describe('first transaction activation signal', () => {
  it('lets a successful retry claim activation after a failed save', () => {
    const signal = createFirstTransactionSignal();
    signal.prepare('expense', []); // This save fails, so its completion is never called.
    const saved = signal.prepare('income', []);
    expect(saved()).toBe(true);
    expect(saved()).toBe(false);
  });

  it('ignores optimistic rows from overlapping saves and claims the first success once', () => {
    const signal = createFirstTransactionSignal();
    const first = signal.prepare('expense', []);
    const second = signal.prepare('income', [{ type: 'expense' }]);
    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });

  it.each(['expense', 'income'] as const)(
    'does not report activation with existing %s history',
    (type) => {
      const signal = createFirstTransactionSignal();
      expect(signal.prepare('expense', [{ type }])()).toBe(false);
    },
  );

  it('ignores transfers and adjustments without consuming the activation signal', () => {
    const signal = createFirstTransactionSignal();
    expect(signal.prepare('transfer', [])()).toBe(false);
    expect(signal.prepare('balance_adjustment', [])()).toBe(false);
    expect(
      signal.prepare('expense', [{ type: 'transfer' }, { type: 'balance_adjustment' }])(),
    ).toBe(true);
  });
});
