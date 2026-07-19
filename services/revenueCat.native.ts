import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
} from 'react-native-purchases';

import { reportError } from './errorReporting';
import type {
  RevenueCatActionResult,
  RevenueCatCustomerState,
  RevenueCatCustomerStateUpdateListener,
  RevenueCatEnvironment,
  RevenueCatOffering,
  RevenueCatPackage,
} from './revenueCat.shared';
import { isRevenueCatCustomerStateActive } from './revenueCat.shared';

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

  // Only count subscriptions still set to auto-renew. A subscription the user
  // has already cancelled stays in `activeSubscriptions` until it expires, but
  // it will stop billing on its own — so it must not read as "renewing".
  //
  // This mirrors RevenueCat's recommended `willRenew && unsubscribeDetectedAt
  // == nil` check: `willRenew` alone can lag behind an Apple-side cancellation
  // when App Store Server Notifications aren't configured, so we also treat a
  // detected unsubscribe as "not renewing" to avoid nagging a user who already
  // cancelled.
  const hasRenewingSubscription = customerInfo.activeSubscriptions.some((productIdentifier) => {
    const subscription = customerInfo.subscriptionsByProductIdentifier?.[productIdentifier];
    return !!subscription?.willRenew && !subscription.unsubscribeDetectedAt;
  });

  return {
    activatedAt: source?.originalPurchaseDate ?? null,
    activeProductIdentifier: source?.productIdentifier ?? null,
    expirationDate: source?.expirationDate ?? null,
    latestPurchaseDate: source?.latestPurchaseDate ?? null,
    hasRenewingSubscription,
  };
}

function getRevenueCatNotAvailableMessage(environment: RevenueCatEnvironment) {
  switch (environment.reason) {
    case 'expo_go':
      return 'Purchases are unavailable in Expo Go. Use a development build or TestFlight.';
    case 'missing_api_key':
    case 'missing_entitlement':
      return 'Purchases are not configured in this build.';
    case 'unsupported':
      return 'Purchases are not supported on this device.';
    default:
      return 'Purchases are not available right now.';
  }
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

export async function fetchRevenueCatOfferings(): Promise<RevenueCatOffering | null> {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return null;
  }

  try {
    await ensureRevenueCatConfigured();
    const offerings = await Purchases.getOfferings();

    const offering = environment.offeringIdentifier
      ? offerings.all[environment.offeringIdentifier]
      : offerings.current;

    if (!offering) return null;

    const packages: RevenueCatPackage[] = offering.availablePackages.map((pkg) => ({
      identifier: pkg.identifier,
      localizedPriceString: pkg.product.priceString,
      localizedPricePerMonthString: pkg.product.pricePerMonthString,
      packageType: pkg.packageType,
      subscriptionPeriod: pkg.product.subscriptionPeriod,
    }));

    return {
      identifier: offering.identifier,
      packages,
    };
  } catch {
    return null;
  }
}

export function subscribeToRevenueCatCustomerStateUpdates(
  listener: RevenueCatCustomerStateUpdateListener,
) {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return () => {};
  }

  const customerInfoListener: CustomerInfoUpdateListener = (customerInfo) => {
    listener(toRevenueCatCustomerState(customerInfo));
  };

  Purchases.addCustomerInfoUpdateListener(customerInfoListener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
  };
}

export async function purchaseRevenueCatPackage(
  packageIdentifier: string,
): Promise<RevenueCatActionResult> {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return {
      customerState: null,
      message: getRevenueCatNotAvailableMessage(environment),
      status: 'not_available',
    };
  }

  try {
    await ensureRevenueCatConfigured();
    const offerings = await Purchases.getOfferings();

    const offering = environment.offeringIdentifier
      ? offerings.all[environment.offeringIdentifier]
      : offerings.current;

    const pkg = offering?.availablePackages.find((p) => p.identifier === packageIdentifier);

    if (!pkg) {
      return {
        customerState: null,
        message: 'Package not found.',
        status: 'not_found',
      };
    }

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const customerState = toRevenueCatCustomerState(customerInfo);

    if (!isRevenueCatCustomerStateActive(customerState)) {
      return {
        customerState,
        message:
          'Your purchase completed, but Pro access is not active yet. Please wait a moment or tap Restore Purchases.',
        status: 'pending',
      };
    }

    return {
      customerState,
      message: null,
      status: 'success',
    };
  } catch (error) {
    // The store can reject the purchase because the account already owns the
    // product — e.g. a lifetime unlock bought before a device reset that
    // regenerated our App User ID. Rather than dead-ending on "you already own
    // this item", restore it: this re-posts the store purchase to the current
    // App User ID (with an Android syncPurchases nudge) and grants Pro if the
    // transfer succeeds.
    const purchasesError = error as Partial<PurchasesError> | null;
    if (purchasesError?.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
      const restoreResult = await restoreRevenueCatPurchases();
      if (isRevenueCatCustomerStateActive(restoreResult.customerState)) {
        return {
          customerState: restoreResult.customerState,
          message: null,
          status: 'success',
        };
      }
    }

    return toRevenueCatErrorResult(error);
  }
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatActionResult> {
  const environment = getRevenueCatEnvironment();

  if (!environment.isConfigured || !environment.canMakePurchases) {
    return {
      customerState: null,
      message: getRevenueCatNotAvailableMessage(environment),
      status: 'not_available',
    };
  }

  try {
    await ensureRevenueCatConfigured();

    // On Android there is no cross-reinstall receipt like iOS StoreKit, so a
    // purchase made under a *previous* App User ID (e.g. after a reinstall or a
    // device reset regenerated our `app_user_id`) is only recovered when its
    // Google Play purchase token is re-posted under the current user, which
    // triggers the project's permitted "Transfer to new App User ID" behavior.
    // `syncPurchasesForResult()` forces that re-post and returns the *updated*
    // CustomerInfo.
    //
    // We must trust that returned CustomerInfo: a follow-up `restorePurchases()`
    // re-queries Google Play and can race the just-completed transfer, coming
    // back with no active entitlement — which is why every Android restore was
    // reporting "no purchases found" despite a valid Play purchase. Only fall
    // through to `restorePurchases()` when the sync yields nothing to transfer.
    // iOS restores via the full StoreKit receipt and doesn't need this.
    if (Platform.OS === 'android') {
      try {
        const { customerInfo: syncedInfo } = await Purchases.syncPurchasesForResult();
        const syncedState = toRevenueCatCustomerState(syncedInfo);
        if (isRevenueCatCustomerStateActive(syncedState)) {
          return {
            customerState: syncedState,
            message: null,
            status: 'success',
          };
        }
      } catch (syncError) {
        // Previously swallowed silently, which hid a 100%-Android restore
        // failure from crash reporting. Report it, then fall through to
        // restorePurchases below (still correct when there is nothing to sync).
        reportError(syncError, { context: 'revenueCat.restore.syncPurchases' });
      }
    }

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
