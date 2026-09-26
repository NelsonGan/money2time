import {
  buildPurchaseAnalytics,
  resolvePaywallVariant,
} from '~/features/settings/lib/paywallAnalytics';
import type { RevenueCatCustomerState, RevenueCatPackage } from '~/services/revenueCat.shared';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function customer(overrides: Partial<RevenueCatCustomerState>): RevenueCatCustomerState {
  return {
    activatedAt: null,
    activeProductIdentifier: null,
    expirationDate: null,
    latestPurchaseDate: null,
    hasRenewingSubscription: false,
    periodType: null,
    ...overrides,
  };
}

const annualWithTrial: RevenueCatPackage = {
  identifier: '$rc_annual',
  localizedPriceString: 'RM 99.90',
  localizedPricePerMonthString: 'RM 8.33',
  price: 99.9,
  currencyCode: 'MYR',
  packageType: 'ANNUAL',
  subscriptionPeriod: 'P1Y',
  freeTrial: { durationIso8601: 'P1W', durationCount: 1, durationUnit: 'week' },
};

const lifetime: RevenueCatPackage = {
  identifier: '$rc_lifetime',
  localizedPriceString: 'RM 199.90',
  localizedPricePerMonthString: null,
  price: 199.9,
  currencyCode: 'MYR',
  packageType: 'LIFETIME',
  subscriptionPeriod: null,
  freeTrial: null,
};

const monthlySubscriber = customer({
  activeProductIdentifier: 'm2t_monthly',
  expirationDate: FUTURE,
  hasRenewingSubscription: true,
  periodType: 'normal',
});
const lifetimeOwner = customer({ activeProductIdentifier: 'm2t_lifetime', periodType: 'normal' });

describe('resolvePaywallVariant', () => {
  it('shows plans to a free user', () => {
    expect(resolvePaywallVariant(false, null)).toBe('plans');
    // A lapsed state is still free.
    expect(resolvePaywallVariant(false, monthlySubscriber)).toBe('plans');
  });

  it('upsells Lifetime to a subscriber', () => {
    expect(resolvePaywallVariant(true, monthlySubscriber)).toBe('lifetime_upgrade');
  });

  it('has nothing to sell a Lifetime owner or an unknown grant', () => {
    expect(resolvePaywallVariant(true, lifetimeOwner)).toBe('already_pro');
    expect(resolvePaywallVariant(true, null)).toBe('already_pro');
  });
});

describe('buildPurchaseAnalytics', () => {
  it('carries the entry point, plan, price and trial offer', () => {
    expect(
      buildPurchaseAnalytics({
        source: 'onboarding',
        pkg: annualWithTrial,
        plan: 'annual',
        planSelection: 'default',
        customerState: null,
      }),
    ).toEqual({
      source: 'onboarding',
      plan: 'annual',
      package: '$rc_annual',
      price: 99.9,
      currency: 'MYR',
      has_free_trial: true,
      trial_duration: 'P1W',
      plan_selection: 'default',
    });
  });

  it('reports no trial for a package without one', () => {
    const properties = buildPurchaseAnalytics({
      source: 'receipt_scan',
      pkg: lifetime,
      plan: 'lifetime',
      planSelection: 'changed',
      customerState: null,
    });

    expect(properties.has_free_trial).toBe(false);
    expect(properties.trial_duration).toBeNull();
    expect(properties.plan_selection).toBe('changed');
    expect(properties).not.toHaveProperty('upgrade_from');
  });

  it('names the plan a subscriber is upgrading from, and omits a selection there was none of', () => {
    const properties = buildPurchaseAnalytics({
      source: 'pro_management',
      pkg: lifetime,
      plan: 'lifetime',
      customerState: monthlySubscriber,
    });

    expect(properties.upgrade_from).toBe('monthly');
    expect(properties).not.toHaveProperty('plan_selection');
  });

  it('does not treat a Lifetime owner buying again as an upgrade', () => {
    const properties = buildPurchaseAnalytics({
      source: 'news',
      pkg: lifetime,
      plan: 'lifetime',
      customerState: lifetimeOwner,
    });

    expect(properties).not.toHaveProperty('upgrade_from');
  });
});
