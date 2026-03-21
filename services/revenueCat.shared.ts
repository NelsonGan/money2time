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

export function isRevenueCatCustomerStateActive(customerState: RevenueCatCustomerState | null) {
  if (!customerState?.activeProductIdentifier) {
    return false;
  }

  return !customerState.expirationDate || new Date(customerState.expirationDate) > new Date();
}
