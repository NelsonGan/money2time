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
