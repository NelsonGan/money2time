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
  /**
   * True when the customer still has at least one active subscription that is
   * set to auto-renew — i.e. it will keep billing. A subscription the user has
   * already cancelled (still active until the end of the paid term, but not
   * renewing) is deliberately excluded. Tracked independently of the resolved
   * entitlement because a Lifetime purchase collapses the entitlement to
   * non-expiring — after that, `expirationDate` alone can no longer reveal a
   * subscription that is still billing in the background.
   */
  hasRenewingSubscription: boolean;
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

/**
 * Lifetime owner who *also* still has an auto-renewing subscription billing in
 * the background — e.g. they upgraded from Monthly to Lifetime but never
 * cancelled the sub. These users are being charged for access they already own
 * forever, so we should persistently nudge them to cancel. A subscription the
 * user has already cancelled is not redundant (it stops billing on its own), so
 * it never triggers this warning.
 */
export function hasRedundantSubscription(customerState: RevenueCatCustomerState | null) {
  return (
    isRevenueCatCustomerStateLifetime(customerState) && !!customerState?.hasRenewingSubscription
  );
}
