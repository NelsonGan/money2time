import {
  createRevenueCatPaywallState,
  type RevenueCatActionResult,
  type RevenueCatCustomerState,
  type RevenueCatEnvironment,
  type RevenueCatPaywallState,
} from './revenueCat.shared';

export * from './revenueCat.shared';

const UNSUPPORTED_ENVIRONMENT: RevenueCatEnvironment = {
  canMakePurchases: false,
  entitlementIdentifier: null,
  isConfigured: false,
  isTestStore: false,
  offeringIdentifier: null,
  reason: 'unsupported',
};

const UNSUPPORTED_CUSTOMER_STATE: RevenueCatCustomerState = {
  activatedAt: null,
  activeProductIdentifier: null,
  expirationDate: null,
  hasAdFreeEntitlement: false,
  latestPurchaseDate: null,
};

export function setRevenueCatAppUserId(_appUserId: string | null) {}

export function getInitialRevenueCatPaywallState() {
  return createRevenueCatPaywallState(UNSUPPORTED_ENVIRONMENT, {
    catalogStatus: null,
    isLoading: false,
  });
}

export async function fetchRevenueCatPaywallState(): Promise<RevenueCatPaywallState> {
  return getInitialRevenueCatPaywallState();
}

export async function purchaseRevenueCatTip(
  _productIdentifier: string,
): Promise<RevenueCatActionResult> {
  return {
    customerState: UNSUPPORTED_CUSTOMER_STATE,
    message: null,
    status: 'not_available',
  };
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatActionResult> {
  return {
    customerState: UNSUPPORTED_CUSTOMER_STATE,
    message: null,
    status: 'not_available',
  };
}
