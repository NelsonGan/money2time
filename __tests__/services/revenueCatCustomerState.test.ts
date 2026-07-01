import {
  isRevenueCatCustomerStateActive,
  isRevenueCatCustomerStateLifetime,
  isRevenueCatCustomerStateSubscriber,
  type RevenueCatCustomerState,
} from '~/services/revenueCat.shared';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function state(overrides: Partial<RevenueCatCustomerState>): RevenueCatCustomerState {
  return {
    activatedAt: null,
    activeProductIdentifier: null,
    expirationDate: null,
    latestPurchaseDate: null,
    ...overrides,
  };
}

describe('revenueCat customer state classifiers', () => {
  const lifetime = state({ activeProductIdentifier: 'm2t_lifetime', expirationDate: null });
  const subscriber = state({ activeProductIdentifier: 'm2t_monthly', expirationDate: FUTURE });
  const expired = state({ activeProductIdentifier: 'm2t_monthly', expirationDate: PAST });

  describe('isRevenueCatCustomerStateActive', () => {
    it('is false when there is no state or no active product', () => {
      expect(isRevenueCatCustomerStateActive(null)).toBe(false);
      expect(isRevenueCatCustomerStateActive(state({}))).toBe(false);
    });

    it('is true for lifetime and unexpired subscribers', () => {
      expect(isRevenueCatCustomerStateActive(lifetime)).toBe(true);
      expect(isRevenueCatCustomerStateActive(subscriber)).toBe(true);
    });

    it('is false once a subscription has expired', () => {
      expect(isRevenueCatCustomerStateActive(expired)).toBe(false);
    });
  });

  describe('isRevenueCatCustomerStateLifetime', () => {
    it('is true only for an active, non-expiring entitlement', () => {
      expect(isRevenueCatCustomerStateLifetime(lifetime)).toBe(true);
      expect(isRevenueCatCustomerStateLifetime(subscriber)).toBe(false);
      expect(isRevenueCatCustomerStateLifetime(expired)).toBe(false);
      expect(isRevenueCatCustomerStateLifetime(null)).toBe(false);
    });
  });

  describe('isRevenueCatCustomerStateSubscriber', () => {
    it('is true only for an active entitlement that still has an expiry', () => {
      expect(isRevenueCatCustomerStateSubscriber(subscriber)).toBe(true);
      expect(isRevenueCatCustomerStateSubscriber(lifetime)).toBe(false);
      expect(isRevenueCatCustomerStateSubscriber(expired)).toBe(false);
      expect(isRevenueCatCustomerStateSubscriber(null)).toBe(false);
    });
  });
});
