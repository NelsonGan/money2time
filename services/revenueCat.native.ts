import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
  type PurchasesOfferings,
} from 'react-native-purchases';

import {
  createRevenueCatPaywallState,
  type RevenueCatActionResult,
  type RevenueCatCustomerState,
  type RevenueCatEnvironment,
  type RevenueCatPaywallState,
  type RevenueCatTipOption,
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

export function getInitialRevenueCatPaywallState() {
  return createRevenueCatPaywallState(getRevenueCatEnvironment());
}

let configurePromise: Promise<void> | null = null;
let cachedPackagesByProductIdentifier = new Map<string, PurchasesPackage>();
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
    hasAdFreeEntitlement: !!activeEntitlement?.isActive,
    latestPurchaseDate: source?.latestPurchaseDate ?? null,
  };
}

function toRevenueCatTipOptions(offering: PurchasesOffering | null): RevenueCatTipOption[] {
  if (!offering) {
    cachedPackagesByProductIdentifier.clear();
    return [];
  }

  const uniquePackages = new Map<string, PurchasesPackage>();
  offering.availablePackages.forEach((aPackage) => {
    uniquePackages.set(aPackage.product.identifier, aPackage);
  });

  cachedPackagesByProductIdentifier = new Map(uniquePackages);

  return Array.from(uniquePackages.values())
    .map((aPackage) => ({
      amount: aPackage.product.price,
      priceString: aPackage.product.priceString,
      productIdentifier: aPackage.product.identifier,
    }))
    .sort((left, right) => left.amount - right.amount);
}

function getOfferingFromCollection(offerings: PurchasesOfferings) {
  const configuredOfferingIdentifier = getRevenueCatEnvironment().offeringIdentifier;

  if (configuredOfferingIdentifier) {
    return offerings.all[configuredOfferingIdentifier] ?? null;
  }

  return offerings.current;
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

async function getRevenueCatOffering() {
  const offerings = await Purchases.getOfferings();
  return getOfferingFromCollection(offerings);
}

async function getRevenueCatPackage(productIdentifier: string) {
  const cachedPackage = cachedPackagesByProductIdentifier.get(productIdentifier);

  if (cachedPackage) {
    return cachedPackage;
  }

  const offering = await getRevenueCatOffering();
  const nextOptions = toRevenueCatTipOptions(offering);
  const matchedOption = nextOptions.find(
    (option) => option.productIdentifier === productIdentifier,
  );

  if (!matchedOption) {
    return null;
  }

  return cachedPackagesByProductIdentifier.get(matchedOption.productIdentifier) ?? null;
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

function withSuccessMessage(customerState: RevenueCatCustomerState): RevenueCatActionResult {
  return {
    customerState,
    message: customerState.hasAdFreeEntitlement
      ? null
      : 'Purchase completed, but the ad-free entitlement is not active. Check your RevenueCat entitlement mapping.',
    status: 'success',
  };
}

export async function fetchRevenueCatPaywallState(): Promise<RevenueCatPaywallState> {
  const environment = getRevenueCatEnvironment();
  const fallbackState = createRevenueCatPaywallState(environment, { isLoading: false });

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return fallbackState;
  }

  try {
    await ensureRevenueCatConfigured();
  } catch {
    return fallbackState;
  }

  const [customerInfoResult, offeringsResult] = await Promise.allSettled([
    Purchases.getCustomerInfo(),
    Purchases.getOfferings(),
  ]);

  const customerState =
    customerInfoResult.status === 'fulfilled'
      ? toRevenueCatCustomerState(customerInfoResult.value)
      : fallbackState;
  const offering =
    offeringsResult.status === 'fulfilled'
      ? getOfferingFromCollection(offeringsResult.value)
      : null;
  const tipOptions = toRevenueCatTipOptions(offering);
  const catalogStatus = !offering
    ? 'offering_not_found'
    : tipOptions.length === 0
      ? 'no_packages'
      : null;

  return createRevenueCatPaywallState(environment, {
    activatedAt: customerState.activatedAt,
    activeProductIdentifier: customerState.activeProductIdentifier,
    catalogStatus,
    expirationDate: customerState.expirationDate,
    hasAdFreeEntitlement: customerState.hasAdFreeEntitlement,
    isLoading: false,
    latestPurchaseDate: customerState.latestPurchaseDate,
    offeringIdentifier: offering?.identifier ?? environment.offeringIdentifier,
    tipOptions,
  });
}

export async function purchaseRevenueCatTip(
  productIdentifier: string,
): Promise<RevenueCatActionResult> {
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

    const matchedPackage = await getRevenueCatPackage(productIdentifier);

    if (!matchedPackage) {
      return {
        customerState: null,
        message: null,
        status: 'not_found',
      };
    }

    const result = await Purchases.purchasePackage(matchedPackage);
    return withSuccessMessage(toRevenueCatCustomerState(result.customerInfo));
  } catch (error) {
    return toRevenueCatErrorResult(error);
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
    return withSuccessMessage(toRevenueCatCustomerState(customerInfo));
  } catch (error) {
    return toRevenueCatErrorResult(error);
  }
}
