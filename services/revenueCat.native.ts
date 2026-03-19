import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
} from 'react-native-purchases';

import type {
  RevenueCatActionResult,
  RevenueCatCustomerState,
  RevenueCatEnvironment,
} from './revenueCat.shared';

export * from './revenueCat.shared';

function normalizeEnvValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isExpoGo() {
  return Constants.executionEnvironment === 'storeClient';
}

function getRevenueCatApiKey() {
  return normalizeEnvValue(
    Platform.select({
      android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
      ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      default: undefined,
    }),
  );
}

function isTestStoreApiKey(apiKey: string | null) {
  return !!apiKey?.startsWith('test_');
}

function getRevenueCatEnvironment(): RevenueCatEnvironment {
  const apiKey = getRevenueCatApiKey();
  const entitlementIdentifier = normalizeEnvValue(
    process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
  );
  const offeringIdentifier = normalizeEnvValue(process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID);

  let reason: RevenueCatEnvironment['reason'] = null;

  if (!apiKey) {
    reason = 'missing_api_key';
  } else if (!entitlementIdentifier) {
    reason = 'missing_entitlement';
  } else if (isExpoGo()) {
    reason = 'expo_go';
  }

  return {
    canMakePurchases: reason === null,
    entitlementIdentifier,
    isConfigured: !!apiKey && !!entitlementIdentifier,
    isTestStore: isTestStoreApiKey(apiKey),
    offeringIdentifier,
    reason,
  };
}

let configurePromise: Promise<void> | null = null;
let desiredRevenueCatAppUserId: string | null = null;
let activeRevenueCatAppUserId: string | null = null;

export function setRevenueCatAppUserId(appUserId: string | null) {
  const normalized = normalizeEnvValue(appUserId ?? undefined);
  desiredRevenueCatAppUserId = normalized;
}

function toRevenueCatCustomerState(customerInfo: CustomerInfo): RevenueCatCustomerState {
  const entitlementIdentifier = getRevenueCatEnvironment().entitlementIdentifier;
  const activeEntitlement = entitlementIdentifier
    ? (customerInfo.entitlements.active[entitlementIdentifier] ?? null)
    : null;
  const knownEntitlement = entitlementIdentifier
    ? (customerInfo.entitlements.all[entitlementIdentifier] ?? null)
    : null;
  const source = activeEntitlement ?? knownEntitlement;

  return {
    activatedAt: source?.originalPurchaseDate ?? null,
    activeProductIdentifier: source?.productIdentifier ?? null,
    expirationDate: source?.expirationDate ?? null,
    latestPurchaseDate: source?.latestPurchaseDate ?? null,
  };
}

async function ensureRevenueCatConfigured() {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return environment;
  }

  if (!configurePromise) {
    configurePromise = (async () => {
      Purchases.configure({
        apiKey: getRevenueCatApiKey()!,
        appUserID: desiredRevenueCatAppUserId,
      });
      activeRevenueCatAppUserId = desiredRevenueCatAppUserId;
    })().catch((error) => {
      configurePromise = null;
      throw error;
    });
  }

  await configurePromise;

  if (desiredRevenueCatAppUserId && activeRevenueCatAppUserId !== desiredRevenueCatAppUserId) {
    await Purchases.logIn(desiredRevenueCatAppUserId);
    activeRevenueCatAppUserId = desiredRevenueCatAppUserId;
  }

  return environment;
}

function toRevenueCatErrorResult(error: unknown): RevenueCatActionResult {
  const purchasesError = error as Partial<PurchasesError> | null;

  if (
    purchasesError?.userCancelled ||
    purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return {
      customerState: null,
      message: null,
      status: 'cancelled',
    };
  }

  return {
    customerState: null,
    message:
      purchasesError?.message ||
      (error instanceof Error ? error.message : 'RevenueCat purchase request failed.'),
    status: 'error',
  };
}

export async function fetchRevenueCatCustomerState(): Promise<RevenueCatCustomerState | null> {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return null;
  }

  try {
    await ensureRevenueCatConfigured();
    const customerInfo = await Purchases.getCustomerInfo();
    return toRevenueCatCustomerState(customerInfo);
  } catch {
    return null;
  }
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatActionResult> {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return {
      customerState: null,
      message: null,
      status: 'not_available',
    };
  }

  try {
    await ensureRevenueCatConfigured();
    const customerInfo = await Purchases.restorePurchases();
    const customerState = toRevenueCatCustomerState(customerInfo);
    return {
      customerState,
      message: null,
      status: 'success',
    };
  } catch (error) {
    return toRevenueCatErrorResult(error);
  }
}
