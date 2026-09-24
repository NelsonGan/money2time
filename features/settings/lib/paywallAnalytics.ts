import { type AnalyticsProperties, resolveProPlan } from '~/services/analytics';
import {
  isRevenueCatCustomerStateSubscriber,
  type RevenueCatCustomerState,
  type RevenueCatPackage,
} from '~/services/revenueCat';

import type { PaywallPlanKind } from './paywallPresentation';

/**
 * Which face of the paywall a visit saw. Only `plans` is a free user who can
 * convert; a subscriber gets the Lifetime upsell, and a Lifetime owner (or a
 * promo grant) the "you're all set" screen, so neither belongs in the
 * denominator of a free-to-paid conversion rate.
 */
export type PaywallVariant = 'plans' | 'lifetime_upgrade' | 'already_pro';

export function resolvePaywallVariant(
  isPro: boolean,
  customerState: RevenueCatCustomerState | null,
): PaywallVariant {
  if (!isPro) return 'plans';
  return isRevenueCatCustomerStateSubscriber(customerState) ? 'lifetime_upgrade' : 'already_pro';
}

export interface PurchaseAnalyticsInput {
  /** The entry point that opened the paywall. */
  source: string;
  pkg: RevenueCatPackage;
  plan: PaywallPlanKind;
  /** Whether the buyer kept the plan the paywall pre-selected; omitted where there was no choice. */
  planSelection?: 'default' | 'changed';
  /** Customer state from before the purchase, which the purchase then replaces. */
  customerState: RevenueCatCustomerState | null;
}

/**
 * The properties every purchase outcome carries, so each one can be split by
 * entry point, plan, price and trial without joining back to the paywall view.
 * `price` is in the store's local `currency`: it is for comparing price points
 * and regional pricing, while revenue itself comes from the stores.
 */
export function buildPurchaseAnalytics({
  source,
  pkg,
  plan,
  planSelection,
  customerState,
}: PurchaseAnalyticsInput): AnalyticsProperties {
  const properties: AnalyticsProperties = {
    source,
    plan,
    package: pkg.identifier,
    price: pkg.price,
    currency: pkg.currencyCode,
    has_free_trial: !!pkg.freeTrial,
    trial_duration: pkg.freeTrial?.durationIso8601 ?? null,
  };
  if (planSelection) properties.plan_selection = planSelection;
  // A subscriber buying again is moving off a plan (in practice to Lifetime),
  // which is a different conversion from a free user's first purchase.
  if (isRevenueCatCustomerStateSubscriber(customerState)) {
    properties.upgrade_from = resolveProPlan(true, customerState?.activeProductIdentifier);
  }
  return properties;
}
