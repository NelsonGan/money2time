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

export interface RevenueCatTipOption {
  amount: number;
  priceString: string;
  productIdentifier: string;
}

export interface RevenueCatCustomerState {
  activatedAt: string | null;
  activeProductIdentifier: string | null;
  expirationDate: string | null;
  hasAdFreeEntitlement: boolean;
  latestPurchaseDate: string | null;
}

export interface RevenueCatPaywallState extends RevenueCatEnvironment, RevenueCatCustomerState {
  catalogStatus: 'offering_not_found' | 'no_packages' | null;
  isLoading: boolean;
  tipOptions: RevenueCatTipOption[];
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

export function createRevenueCatPaywallState(
  environment: RevenueCatEnvironment,
  overrides: Partial<RevenueCatPaywallState> = {},
): RevenueCatPaywallState {
  return {
    activatedAt: null,
    activeProductIdentifier: null,
    catalogStatus: null,
    expirationDate: null,
    hasAdFreeEntitlement: false,
    isLoading: environment.isConfigured && environment.canMakePurchases,
    latestPurchaseDate: null,
    tipOptions: [],
    ...environment,
    ...overrides,
  };
}
