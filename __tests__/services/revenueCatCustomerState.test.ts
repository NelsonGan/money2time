import {
  hasRedundantSubscription,
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
    hasActiveSubscription: false,
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

  describe('hasRedundantSubscription', () => {
    it('is true only for a lifetime owner still carrying an active subscription', () => {
      const lifetimeWithSub = state({
        activeProductIdentifier: 'm2t_lifetime',
        expirationDate: null,
        hasActiveSubscription: true,
      });
      expect(hasRedundantSubscription(lifetimeWithSub)).toBe(true);
    });

    it('is false for a plain lifetime owner with no lingering subscription', () => {
      expect(hasRedundantSubscription(lifetime)).toBe(false);
    });

    it('is false for a subscriber who has not bought lifetime', () => {
      const subscriberWithSub = state({
        activeProductIdentifier: 'm2t_monthly',
        expirationDate: FUTURE,
        hasActiveSubscription: true,
      });
      expect(hasRedundantSubscription(subscriberWithSub)).toBe(false);
      expect(hasRedundantSubscription(null)).toBe(false);
    });
  });
});
