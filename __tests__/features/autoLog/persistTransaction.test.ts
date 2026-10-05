import { PRO_LIMITS } from '~/constants/proLimits';
import { persistAutoLogTransaction } from '~/features/autoLog/persistTransaction';
import type { QuickEntryPrefs } from '~/types';

import { account } from './helpers';

function setup() {
  let inTransaction = false;
  const order: string[] = [];
  const deps = {
    transaction: (write: () => void) => {
      inTransaction = true;
      try {
        write();
      } finally {
        inTransaction = false;
      }
    },
    create: jest.fn(() => {
      expect(inTransaction).toBe(true);
      order.push('transaction');
    }),
    record: jest.fn(() => {
      expect(inTransaction).toBe(true);
      order.push('capture');
    }),
    savePrefs: jest.fn(() => {
      expect(inTransaction).toBe(true);
      order.push('usage');
    }),
  };
  return { deps, order };
}

const options = {
  isPro: false,
  accounts: [account()],
  prefs: { autoLogUsageCount: 0 } as QuickEntryPrefs,
};

describe('durable automatic logging', () => {
  it('commits the expense, capture link and usage in one transaction before returning', () => {
    const { deps, order } = setup();
    expect(persistAutoLogTransaction(options, deps).autoLogUsageCount).toBe(1);
    expect(order).toEqual(['transaction', 'capture', 'usage']);
  });

  it('propagates a failed save without marking a capture or charging usage', () => {
    const { deps } = setup();
    deps.create.mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => persistAutoLogTransaction(options, deps)).toThrow('disk full');
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.savePrefs).not.toHaveBeenCalled();
  });

  it('propagates a failed capture link so the database transaction can roll back', () => {
    const { deps } = setup();
    deps.record.mockImplementation(() => {
      throw new Error('capture failed');
    });
    expect(() => persistAutoLogTransaction(options, deps)).toThrow('capture failed');
    expect(deps.savePrefs).not.toHaveBeenCalled();
  });

  it('enforces the shared limit before saving while Pro remains unlimited', () => {
    const { deps } = setup();
    const exhausted = {
      ...options,
      prefs: { ...options.prefs, autoLogUsageCount: PRO_LIMITS.FREE_MAX_AUTO_LOGS },
    };
    expect(() => persistAutoLogTransaction(exhausted, deps)).toThrow('Auto-log limit reached');
    expect(deps.create).not.toHaveBeenCalled();
    expect(persistAutoLogTransaction({ ...exhausted, isPro: true }, deps).autoLogUsageCount).toBe(
      PRO_LIMITS.FREE_MAX_AUTO_LOGS + 1,
    );
  });
});
