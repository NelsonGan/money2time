import type {
  RevenueCatActionResult,
  RevenueCatCustomerState,
  RevenueCatOffering,
} from './revenueCat.shared';

export * from './revenueCat.shared';

export function setRevenueCatAppUserId(_appUserId: string | null) {}

export async function fetchRevenueCatCustomerState(): Promise<RevenueCatCustomerState | null> {
  return null;
}

export async function fetchRevenueCatOfferings(): Promise<RevenueCatOffering | null> {
  return null;
}

export async function purchaseRevenueCatPackage(
  _packageIdentifier: string,
): Promise<RevenueCatActionResult> {
  return {
    customerState: null,
    message: null,
    status: 'not_available',
  };
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatActionResult> {
  return {
    customerState: null,
    message: null,
    status: 'not_available',
  };
}
