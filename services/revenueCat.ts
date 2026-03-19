import type { RevenueCatActionResult, RevenueCatCustomerState } from './revenueCat.shared';

export * from './revenueCat.shared';

export function setRevenueCatAppUserId(_appUserId: string | null) {}

export async function fetchRevenueCatCustomerState(): Promise<RevenueCatCustomerState | null> {
  return null;
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatActionResult> {
  return {
    customerState: null,
    message: null,
    status: 'not_available',
  };
}
