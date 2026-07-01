export type RevenueCatAvailabilityReason =
  | 'missing_api_key'
  | 'missing_entitlement'
  | 'expo_go'
  | 'unsupported';

export interface RevenueCatEnvironment {
  isTestStore: boolean;
  isConfigured: boolean;
  canMakePurchases: boolean;
  reason: RevenueCatAvailabilityReason | null;
  offeringIdentifier: string | null;
  entitlementIdentifier: string | null;
}

export interface RevenueCatCustomerState {
  activatedAt: string | null;
  activeProductIdentifier: string | null;
  expirationDate: string | null;
  latestPurchaseDate: string | null;
}

export type RevenueCatActionStatus =
  | 'success'
  | 'pending'
  | 'cancelled'
  | 'not_available'
  | 'not_found'
  | 'error';

export interface RevenueCatActionResult {
  customerState: RevenueCatCustomerState | null;
  message: string | null;
  status: RevenueCatActionStatus;
}

export interface RevenueCatPackage {
  identifier: string;
  localizedPriceString: string;
  localizedPricePerMonthString: string | null;
  packageType: string;
  subscriptionPeriod: string | null;
}

export interface RevenueCatOffering {
  identifier: string;
  packages: RevenueCatPackage[];
}

export type RevenueCatCustomerStateUpdateListener = (
  customerState: RevenueCatCustomerState,
) => void;

export function isRevenueCatCustomerStateActive(customerState: RevenueCatCustomerState | null) {
  if (!customerState?.activeProductIdentifier) {
    return false;
  }

  return !customerState.expirationDate || new Date(customerState.expirationDate) > new Date();
}

/**
 * Lifetime Pro: an active, non-expiring entitlement (a one-time / non-consumable
 * purchase). There is nothing left to upsell to these users.
 */
export function isRevenueCatCustomerStateLifetime(customerState: RevenueCatCustomerState | null) {
  return isRevenueCatCustomerStateActive(customerState) && !customerState?.expirationDate;
}

/**
 * Subscriber: active Pro backed by an auto-renewing subscription (has an
 * expiration date). These users can still upgrade to Lifetime.
 */
export function isRevenueCatCustomerStateSubscriber(customerState: RevenueCatCustomerState | null) {
  return isRevenueCatCustomerStateActive(customerState) && !!customerState?.expirationDate;
}
