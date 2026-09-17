import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  INTRO_ELIGIBILITY_STATUS,
  RECURRENCE_MODE,
  type IntroEligibility,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesIntroPrice,
  type PurchasesPackage,
  type SubscriptionOption,
} from 'react-native-purchases';

import { reportError } from './errorReporting';
import type {
  RevenueCatActionResult,
  RevenueCatCustomerState,
  RevenueCatCustomerStateUpdateListener,
  RevenueCatEnvironment,
  RevenueCatFreeTrial,
  RevenueCatOffering,
  RevenueCatPackage,
  RevenueCatTrialDurationUnit,
} from './revenueCat.shared';
import { DEV_MOCK_OFFERING, isRevenueCatCustomerStateActive } from './revenueCat.shared';

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

let configured = false;
let loginPromise: Promise<void> | null = null;
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
    // History includes refunded/revoked lifetime purchases with no expiry.
    // Only the active entitlement can authorize access.
    activeProductIdentifier: activeEntitlement?.productIdentifier ?? null,
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

  if (!configured) {
    Purchases.configure({
      apiKey: getRevenueCatApiKey()!,
      appUserID: desiredRevenueCatAppUserId,
    });
    activeRevenueCatAppUserId = desiredRevenueCatAppUserId;
    configured = true;
  }

  // Refresh, offerings and restore can arrive together during startup. Share
  // the login and record the ID actually passed to the SDK, then recheck in
  // case settings changed while it was in flight.
  while (
    loginPromise ||
    (desiredRevenueCatAppUserId && activeRevenueCatAppUserId !== desiredRevenueCatAppUserId)
  ) {
    if (!loginPromise) {
      const appUserId = desiredRevenueCatAppUserId!;
      loginPromise = (async () => {
        await Purchases.logIn(appUserId);
        activeRevenueCatAppUserId = appUserId;
      })().finally(() => {
        loginPromise = null;
      });
    }
    await loginPromise;
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

// In development, fall back to the mock offering (with a warning) so the paywall
// shows realistic prices. Never returns the mock in production.
function mockOfferingFallback(reason: string): RevenueCatOffering | null {
  if (!__DEV__) return null;
  console.warn(`[RevenueCat] Using DEV mock offering (${reason}).`);
  return DEV_MOCK_OFFERING;
}

function normalizeTrialDurationUnit(value: string): RevenueCatTrialDurationUnit | null {
  switch (value.trim().toUpperCase()) {
    case 'DAY':
      return 'day';
    case 'WEEK':
      return 'week';
    case 'MONTH':
      return 'month';
    case 'YEAR':
      return 'year';
    default:
      return null;
  }
}

function buildFreeTrial(
  durationIso8601: string,
  durationUnit: string,
  periodCount: number,
  cycles: number,
): RevenueCatFreeTrial | null {
  const unit = normalizeTrialDurationUnit(durationUnit);
  const normalizedIso8601 = durationIso8601.trim().toUpperCase();
  const durationMatch = /^P(\d+)([DWMY])$/.exec(normalizedIso8601);
  const isoLetter = durationMatch?.[2] as 'D' | 'W' | 'M' | 'Y' | undefined;
  const isoUnit = isoLetter
    ? ({ D: 'day', W: 'week', M: 'month', Y: 'year' } as const)[isoLetter]
    : null;
  const isoPeriodCount = durationMatch ? Number(durationMatch[1]) : 0;
  // RevenueCat's Android bridge preserves P1W but reports it as DAY/7 for
  // backwards compatibility, so compare day and week periods by duration.
  const reportedDays = unit === 'day' ? periodCount : unit === 'week' ? periodCount * 7 : null;
  const isoDays =
    isoUnit === 'day' ? isoPeriodCount : isoUnit === 'week' ? isoPeriodCount * 7 : null;
  const periodsMatch =
    (unit === isoUnit && periodCount === isoPeriodCount) ||
    (reportedDays !== null &&
      isoDays !== null &&
      Number.isSafeInteger(reportedDays) &&
      Number.isSafeInteger(isoDays) &&
      reportedDays === isoDays);
  const durationCount = isoPeriodCount * cycles;
  if (
    !unit ||
    !isoUnit ||
    !isoLetter ||
    !Number.isSafeInteger(periodCount) ||
    periodCount <= 0 ||
    !Number.isSafeInteger(isoPeriodCount) ||
    isoPeriodCount <= 0 ||
    !Number.isSafeInteger(cycles) ||
    cycles <= 0 ||
    !Number.isSafeInteger(durationCount) ||
    !periodsMatch
  ) {
    return null;
  }

  return {
    durationIso8601: `P${durationCount}${isoLetter}`,
    durationCount,
    durationUnit: isoUnit,
  };
}

function getIosFreeTrial(
  introPrice: PurchasesIntroPrice | null,
  eligibility: IntroEligibility | undefined,
): RevenueCatFreeTrial | null {
  if (
    !introPrice ||
    introPrice.price !== 0 ||
    eligibility?.status !== INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
  ) {
    return null;
  }

  return buildFreeTrial(
    introPrice.period,
    introPrice.periodUnit,
    introPrice.periodNumberOfUnits,
    introPrice.cycles,
  );
}

function getAndroidFreeTrial(option: SubscriptionOption | null | undefined) {
  const freePhase = option?.freePhase;
  if (
    !freePhase ||
    freePhase.price.amountMicros !== 0 ||
    // Google Play may combine a free phase with a discounted paid intro phase.
    // Our paywall describes a direct transition to the ordinary renewal price.
    !!option?.introPhase ||
    (!!option?.pricingPhases?.length && option.pricingPhases[0]?.price.amountMicros !== 0)
  ) {
    return null;
  }

  // Null cycle count is only safe to read as one period for a non-recurring
  // phase. Otherwise the free duration cannot be stated accurately.
  const cycles =
    freePhase.billingCycleCount ??
    (freePhase.recurrenceMode === RECURRENCE_MODE.NON_RECURRING ? 1 : null);
  if (cycles === null) return null;

  return buildFreeTrial(
    freePhase.billingPeriod.iso8601,
    freePhase.billingPeriod.unit,
    freePhase.billingPeriod.value,
    cycles,
  );
}

async function getIosIntroEligibility(packages: PurchasesPackage[]) {
  if (Platform.OS !== 'ios') {
    return {} as Record<string, IntroEligibility>;
  }

  const productIdentifiers = packages
    .filter((pkg) => pkg.product.introPrice?.price === 0)
    .map((pkg) => pkg.product.identifier);
  if (productIdentifiers.length === 0) {
    return {} as Record<string, IntroEligibility>;
  }

  try {
    return await Purchases.checkTrialOrIntroductoryPriceEligibility(productIdentifiers);
  } catch {
    // Eligibility is part of the copy contract. If it cannot be confirmed, keep
    // the purchasable plan but show its ordinary billing terms.
    return {} as Record<string, IntroEligibility>;
  }
}

export async function fetchRevenueCatOfferings(): Promise<RevenueCatOffering | null> {
  const environment = getRevenueCatEnvironment();

  // When purchases aren't configured (Expo Go) or products can't load (simulator
  // without a StoreKit config, or App Store products not ready), fall back to the
  // mock offering so the paywall still shows realistic prices in development.
  if (!environment.isConfigured || !environment.canMakePurchases) {
    return mockOfferingFallback(environment.reason ?? 'purchases unavailable');
  }

  try {
    await ensureRevenueCatConfigured();
    const offerings = await Purchases.getOfferings();

    const offering = environment.offeringIdentifier
      ? offerings.all[environment.offeringIdentifier]
      : offerings.current;

    if (!offering || offering.availablePackages.length === 0) {
      return mockOfferingFallback('no available packages');
    }

    const iosIntroEligibility = await getIosIntroEligibility(offering.availablePackages);

    const packages: RevenueCatPackage[] = offering.availablePackages.map((pkg) => ({
      identifier: pkg.identifier,
      localizedPriceString: pkg.product.priceString,
      localizedPricePerMonthString: pkg.product.pricePerMonthString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode,
      packageType: pkg.packageType,
      subscriptionPeriod: pkg.product.subscriptionPeriod,
      freeTrial:
        Platform.OS === 'ios'
          ? getIosFreeTrial(pkg.product.introPrice, iosIntroEligibility[pkg.product.identifier])
          : Platform.OS === 'android'
            ? getAndroidFreeTrial(pkg.product.defaultOption)
            : null,
    }));

    return {
      identifier: offering.identifier,
      packages,
    };
  } catch (error) {
    return mockOfferingFallback(error instanceof Error ? error.message : 'getOfferings failed');
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
  // Dev-only mock packages have no real store product to buy.
  if (__DEV__ && packageIdentifier.startsWith('dev_')) {
    return {
      customerState: null,
      message: 'This is a dev-only mock plan. Purchases need a real StoreKit / RevenueCat setup.',
      status: 'not_available',
    };
  }

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
    // App User ID and grants Pro if the transfer succeeds.
    const purchasesError = error as Partial<PurchasesError> | null;
    if (purchasesError?.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
      const restoreResult = await restoreRevenueCatPurchases();
      if (
        restoreResult.status !== 'success' ||
        isRevenueCatCustomerStateActive(restoreResult.customerState)
      ) {
        return restoreResult;
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

    // Explicit restore posts Play purchases with isRestore=true. Background
    // sync uses the SDK's account-sharing policy instead, and must not precede
    // or short-circuit this user-requested restore. Neither API can recover a
    // consumed lifetime purchase on Billing Client 8; see docs/pro-restoration.md.
    const customerInfo = await Purchases.restorePurchases();
    const customerState = toRevenueCatCustomerState(customerInfo);
    return {
      customerState,
      message: null,
      status: 'success',
    };
  } catch (error) {
    const result = toRevenueCatErrorResult(error);
    if (result.status === 'error') {
      reportError(error, { context: 'revenueCat.restore', platform: Platform.OS });
    }
    return result;
  }
}
