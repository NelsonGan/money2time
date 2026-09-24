/**
 * Native product analytics integration.
 *
 * GA4 receives every event from every user. Mixpanel also receives every user,
 * but only the events in `MIXPANEL_EVENTS` (see `analytics.shared.ts`): it
 * bills per event, so it gets the install, activation and purchase funnels and
 * product usage as milestones, and none of the per-use telemetry. Its automatic
 * mobile events (`$ae_session`, `$ae_first_open`, ...) are switched off for the
 * same reason; `First App Open` replaces the one worth keeping.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import {
  AnalyticsEvents,
  type AnalyticsEventName,
  type AnalyticsProperties,
  type AnalyticsSuperProperties,
  daysSinceInstall,
  EMPTY_USAGE_STATE,
  featureUsedBy,
  isMixpanelEvent,
  parseUsageState,
  type ProductFeature,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
  TRANSACTION_MILESTONES,
  USAGE_STATE_STORAGE_KEY,
  type UsageState,
} from './analytics.shared';

export * from './analytics.shared';

type MixpanelInstance = any;
type FirebaseAnalyticsSdk = typeof import('@react-native-firebase/analytics');
type FirebaseAnalyticsInstance = ReturnType<FirebaseAnalyticsSdk['getAnalytics']>;
const IS_DEVELOPMENT = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Mixpanel's legacy automatic mobile events. Off: `$ae_session` fired on every
 * app background and was the bulk of the bill while answering nothing GA4's
 * own session reporting does not.
 */
const TRACK_AUTOMATIC_EVENTS = false;

/**
 * Super properties earlier releases registered. The SDK persists super
 * properties on the device, so each would ride on every future event until
 * explicitly removed:
 *
 * - `sample_rate`: the retired 50% cohort sampling's marker, which was also
 *   written to the profile;
 * - `current_screen`: registered on every navigation, which rewrote the SDK's
 *   persisted store on each screen change. `trackEvent` stamps the screen on
 *   each event instead, so a persisted copy could only ever be a stale one.
 */
const RETIRED_SUPER_PROPERTIES = ['sample_rate', 'current_screen'] as const;
const RETIRED_PROFILE_PROPERTIES: ReadonlySet<string> = new Set(['sample_rate']);

/** Past the last milestone the count has nothing left to report. */
const LAST_TRANSACTION_MILESTONE = Math.max(...TRANSACTION_MILESTONES);

let hasWarnedMissingMixpanelToken = false;
let hasWarnedMissingMixpanelSdk = false;
let hasWarnedUsingMixpanelJsMode = false;
let hasWarnedMissingFirebaseSdk = false;
let hasWarnedAnalyticsFailure = false;

function warnOnce(
  kind: 'mixpanel-token' | 'mixpanel-sdk' | 'mixpanel-js' | 'firebase-sdk',
  error?: unknown,
) {
  if (!IS_DEVELOPMENT) return;
  if (kind === 'mixpanel-token') {
    if (hasWarnedMissingMixpanelToken) return;
    hasWarnedMissingMixpanelToken = true;
    console.warn(
      '[Analytics] EXPO_PUBLIC_MIXPANEL_TOKEN is missing. Mixpanel tracking is disabled.',
    );
  } else if (kind === 'mixpanel-sdk') {
    if (hasWarnedMissingMixpanelSdk) return;
    hasWarnedMissingMixpanelSdk = true;
    console.warn('[Analytics] mixpanel-react-native is unavailable in this build.', error);
  } else if (kind === 'mixpanel-js') {
    if (hasWarnedUsingMixpanelJsMode) return;
    hasWarnedUsingMixpanelJsMode = true;
    console.warn('[Analytics] Mixpanel native module is unavailable; using JavaScript mode.');
  } else {
    if (hasWarnedMissingFirebaseSdk) return;
    hasWarnedMissingFirebaseSdk = true;
    console.warn(
      '[Analytics] Firebase Analytics is unavailable. Add Firebase app config and rebuild the native app.',
      error,
    );
  }
}

function reportProviderFailure(
  provider: 'Mixpanel' | 'Firebase',
  operation: string,
  error: unknown,
) {
  if (!IS_DEVELOPMENT || hasWarnedAnalyticsFailure) return;
  hasWarnedAnalyticsFailure = true;
  console.warn(`[Analytics] ${provider} ${operation} failed:`, error);
}

let mixpanelInstance: MixpanelInstance | null = null;
let mixpanelInitPromise: Promise<void> | null = null;
let firebaseAnalytics:
  | { sdk: FirebaseAnalyticsSdk; instance: FirebaseAnalyticsInstance }
  | null
  | undefined;
let analyticsUserId: string | null = null;
let installDate: string | null = null;
let currentScreen: string | null = null;
let lastFirebaseScreen: string | null = null;
let usageState: UsageState | null = null;
let usageUpdates: Promise<unknown> = Promise.resolve();

let resolveAnalyticsReady: () => void;
let analyticsReadyPromise = new Promise<void>((resolve) => {
  resolveAnalyticsReady = resolve;
});

function getMixpanelToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN?.trim();
  return token || null;
}

function isMixpanelNativeModuleAvailable(): boolean {
  return Boolean(NativeModules.MixpanelReactNative);
}

function getMixpanelClass(): (new (...args: unknown[]) => MixpanelInstance) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mixpanel-react-native').Mixpanel;
  } catch (error) {
    warnOnce('mixpanel-sdk', error);
    return null;
  }
}

async function ensureMixpanelInitialized(): Promise<MixpanelInstance | null> {
  const token = getMixpanelToken();
  if (!token) {
    warnOnce('mixpanel-token');
    return null;
  }
  if (mixpanelInstance) return mixpanelInstance;

  if (!mixpanelInitPromise) {
    mixpanelInitPromise = (async () => {
      const MixpanelClass = getMixpanelClass();
      if (!MixpanelClass) return;
      const useNativeMixpanel = isMixpanelNativeModuleAvailable();
      if (!useNativeMixpanel) warnOnce('mixpanel-js');

      const mp = new MixpanelClass(token, TRACK_AUTOMATIC_EVENTS, useNativeMixpanel);
      await mp.init();
      mixpanelInstance = mp;
    })().catch((error) => {
      mixpanelInitPromise = null;
      reportProviderFailure('Mixpanel', 'initialization', error);
    });
  }

  await mixpanelInitPromise;
  return mixpanelInstance;
}

function getFirebaseAnalytics(): {
  sdk: FirebaseAnalyticsSdk;
  instance: FirebaseAnalyticsInstance;
} | null {
  if (firebaseAnalytics !== undefined) return firebaseAnalytics;
  try {
    // Lazy loading keeps Expo Go and native builds made before this dependency
    // was added from crashing when the JavaScript bundle starts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@react-native-firebase/analytics') as FirebaseAnalyticsSdk;
    firebaseAnalytics = { sdk, instance: sdk.getAnalytics() };
  } catch (error) {
    firebaseAnalytics = null;
    warnOnce('firebase-sdk', error);
  }
  return firebaseAnalytics;
}

async function logFirebaseScreen(screen: string): Promise<void> {
  if (screen === lastFirebaseScreen) return;
  const firebase = getFirebaseAnalytics();
  if (!firebase) return;
  try {
    await firebase.sdk.logScreenView(firebase.instance, {
      screen_name: screen,
      screen_class: screen,
    });
    lastFirebaseScreen = screen;
  } catch (error) {
    reportProviderFailure('Firebase', 'screen tracking', error);
  }
}

/**
 * Drop `RETIRED_SUPER_PROPERTIES` from an install that still carries them.
 * Keyed off the persisted super properties themselves, so it runs once per
 * affected install and is a single local read for everyone else.
 */
async function clearRetiredProperties(mp: MixpanelInstance): Promise<void> {
  const superProperties: Record<string, unknown> | null = await mp.getSuperProperties();
  if (!superProperties) return;
  for (const property of RETIRED_SUPER_PROPERTIES) {
    if (!(property in superProperties)) continue;
    mp.unregisterSuperProperty(property);
    if (RETIRED_PROFILE_PROPERTIES.has(property)) mp.getPeople().unset(property);
  }
}

async function configureProviders(appUserId: string): Promise<void> {
  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      // Configure identity and consent before collection starts so the first
      // event is attributed to the stable app user and never enables ad data.
      await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
      await firebase.sdk.setConsent(firebase.instance, {
        analytics_storage: true,
        ad_storage: false,
        ad_user_data: false,
        ad_personalization: false,
      });
      await firebase.sdk.setDefaultEventParameters(
        firebase.instance,
        IS_DEVELOPMENT ? { debug_mode: 1 } : undefined,
      );
      await firebase.sdk.setUserId(firebase.instance, appUserId);
      await firebase.sdk.setUserProperties(
        firebase.instance,
        toGa4UserProperties({ platform: Platform.OS }),
      );
      await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, true);
    } catch (error) {
      reportProviderFailure('Firebase', 'configuration', error);
    }
  }

  const mp = await ensureMixpanelInitialized();
  if (mp) {
    try {
      mp.identify(appUserId);
      mp.getPeople().set({ $name: appUserId, platform: Platform.OS });
      await clearRetiredProperties(mp);
    } catch (error) {
      reportProviderFailure('Mixpanel', 'identification', error);
    }
  }

  if (currentScreen) await logFirebaseScreen(currentScreen);
}

/** Identify both providers before either receives events, profile data or screens. */
export async function identifyUser(appUserId: string): Promise<void> {
  const normalizedId = appUserId.trim();
  if (!normalizedId) return;
  if (normalizedId === analyticsUserId) {
    await analyticsReadyPromise;
    return;
  }

  analyticsUserId = normalizedId;
  await configureProviders(normalizedId);
  resolveAnalyticsReady();
}

/**
 * Anchor for the `days_since_install` every event carries, from
 * `settings.firstAppOpen`. Also stamped once on the Mixpanel profile as
 * `first_app_open`, so users who installed before `First App Open` existed
 * still fall into an install cohort. GA4 records its own first open.
 */
export async function setInstallDate(firstAppOpen: string | null): Promise<void> {
  installDate = firstAppOpen;
  if (!firstAppOpen) return;
  await analyticsReadyPromise;

  const mp = await ensureMixpanelInitialized();
  if (!mp) return;
  try {
    mp.getPeople().setOnce({ first_app_open: firstAppOpen });
  } catch (error) {
    reportProviderFailure('Mixpanel', 'install date', error);
  }
}

// Storage failures, thrown or rejected, must never reach `trackEvent`'s
// fire-and-forget callers. Unreadable reads as empty, which reports nothing.
async function readStoredUsageState(): Promise<UsageState> {
  try {
    return parseUsageState(await AsyncStorage.getItem(USAGE_STATE_STORAGE_KEY));
  } catch {
    return EMPTY_USAGE_STATE;
  }
}

async function writeStoredUsageState(state: UsageState): Promise<void> {
  try {
    await AsyncStorage.setItem(USAGE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Kept in memory for this session; at worst a relaunch repeats a first use.
  }
}

/**
 * Apply one read-modify-write to the stored `UsageState`, serialized so two
 * uses at the same moment cannot both read the same snapshot.
 */
function updateUsageState<T>(change: (state: UsageState) => [UsageState, T]): Promise<T> {
  const result = usageUpdates.then(async () => {
    usageState ??= await readStoredUsageState();
    const [next, value] = change(usageState);
    if (next !== usageState) {
      usageState = next;
      await writeStoredUsageState(next);
    }
    return value;
  });
  usageUpdates = result.catch(() => undefined);
  return result;
}

/**
 * A milestone is reported after a storage round trip, by which time the user
 * may have left the screen they reached it on (an editor that closed on save),
 * so it carries the screen of the action itself.
 */
function onScreen(screen: string | null): AnalyticsProperties {
  return screen ? { current_screen: screen } : {};
}

/**
 * Record a feature use: on the Mixpanel profile the first time this install
 * uses it (not billed), and as `Feature First Used` when the install has been
 * tracked since its first launch.
 */
async function recordFeatureUse(feature: ProductFeature, screen: string | null): Promise<void> {
  const isFirstUseSinceInstall = await updateUsageState<boolean | null>((state) =>
    state.features.includes(feature)
      ? [state, null]
      : [{ ...state, features: [...state.features, feature] }, state.fromInstall],
  );
  if (isFirstUseSinceInstall === null) return;

  const mp = await ensureMixpanelInitialized();
  if (mp) {
    try {
      mp.getPeople().union('features_used', [feature]);
    } catch (error) {
      reportProviderFailure('Mixpanel', 'feature profile', error);
    }
  }
  if (isFirstUseSinceInstall) {
    await trackEvent(AnalyticsEvents.FEATURE_FIRST_USED, { feature, ...onScreen(screen) });
  }
}

/**
 * Count an expense or income the user logged, and report each of
 * `TRANSACTION_MILESTONES` as the install reaches it. Counts only on installs
 * tracked since their first launch, whose count starts at zero (`UsageState`).
 */
export async function recordLoggedTransaction(): Promise<void> {
  const screen = currentScreen;
  const milestone = await updateUsageState<number | null>((state) => {
    if (!state.fromInstall || state.loggedTransactions >= LAST_TRANSACTION_MILESTONE) {
      return [state, null];
    }
    const loggedTransactions = state.loggedTransactions + 1;
    return [
      { ...state, loggedTransactions },
      TRANSACTION_MILESTONES.includes(loggedTransactions) ? loggedTransactions : null,
    ];
  });
  if (milestone != null) {
    await trackEvent(AnalyticsEvents.TRANSACTION_MILESTONE_REACHED, {
      count: milestone,
      ...onScreen(screen),
    });
  }
}

/**
 * Track every event in GA4, and `MIXPANEL_EVENTS` in Mixpanel. An event that is
 * a feature use (`featureUsedBy`) also records that use once it has been sent.
 */
export async function trackEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties,
): Promise<void> {
  if (eventName === AnalyticsEvents.FIRST_APP_OPEN) {
    // A new install starts a usage record whose firsts are real firsts. Queued
    // now, ahead of any use the new user can make.
    void updateUsageState((): [UsageState, void] => [
      { ...EMPTY_USAGE_STATE, fromInstall: true },
      undefined,
    ]);
  }
  // The screen and the clock are read at the call, so they describe when the
  // event happened, but the install date after the wait: an event queued during
  // launch fires before the settings that carry it have loaded.
  const screen =
    typeof properties?.current_screen === 'string' ? properties.current_screen : currentScreen;
  const trackedAt = Date.now();
  await analyticsReadyPromise;

  const eventProperties: AnalyticsProperties = { ...properties };
  if (screen) eventProperties.current_screen = screen;
  const installAge = daysSinceInstall(installDate, trackedAt);
  if (installAge != null) eventProperties.days_since_install ??= installAge;

  const [mp, firebase] = await Promise.all([
    isMixpanelEvent(eventName) ? ensureMixpanelInitialized() : Promise.resolve(null),
    Promise.resolve(getFirebaseAnalytics()),
  ]);

  if (mp) {
    try {
      mp.track(eventName, eventProperties);
    } catch (error) {
      reportProviderFailure('Mixpanel', 'event tracking', error);
    }
  }
  if (firebase) {
    try {
      await firebase.sdk.logEvent(
        firebase.instance,
        toGa4EventName(eventName),
        toGa4EventParameters(eventProperties),
      );
    } catch (error) {
      reportProviderFailure('Firebase', 'event tracking', error);
    }
  }

  const feature = featureUsedBy(eventName, properties);
  if (feature) await recordFeatureUse(feature, screen);
}

/**
 * Follow the visible React Navigation screen: `trackEvent` stamps it on each
 * event as `current_screen`, and GA4 gets a `screen_view` per change.
 */
export async function setCurrentScreen(screen: string | null): Promise<void> {
  if (screen === currentScreen) return;
  currentScreen = screen;
  if (!screen) return;
  await analyticsReadyPromise;
  if (screen !== currentScreen) return;
  await logFirebaseScreen(screen);
}

/** Register event context in Mixpanel and stable user traits in GA4. */
export async function setSuperProperties(properties: AnalyticsSuperProperties): Promise<void> {
  await analyticsReadyPromise;

  const mp = await ensureMixpanelInitialized();
  if (mp) {
    try {
      mp.registerSuperProperties(properties);
    } catch (error) {
      reportProviderFailure('Mixpanel', 'super properties', error);
    }
  }

  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setUserProperties(
        firebase.instance,
        toGa4UserProperties({ ...properties }),
      );
    } catch (error) {
      reportProviderFailure('Firebase', 'user properties', error);
    }
  }
}

/** Update the user profile in both providers. */
export async function setUserProperties(
  properties: Record<string, string | number | boolean>,
): Promise<void> {
  await analyticsReadyPromise;

  const mp = await ensureMixpanelInitialized();
  if (mp) {
    try {
      mp.getPeople().set(properties);
    } catch (error) {
      reportProviderFailure('Mixpanel', 'user properties', error);
    }
  }

  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setUserProperties(firebase.instance, toGa4UserProperties(properties));
    } catch (error) {
      reportProviderFailure('Firebase', 'user properties', error);
    }
  }
}

/** Firebase manages its own batches; Mixpanel exposes the explicit flush. */
export async function flushAnalytics(): Promise<void> {
  await analyticsReadyPromise;
  const mp = await ensureMixpanelInitialized();
  if (!mp) return;
  try {
    mp.flush();
  } catch (error) {
    reportProviderFailure('Mixpanel', 'flush', error);
  }
}

export async function resetAnalytics(): Promise<void> {
  const mp = await ensureMixpanelInitialized();
  if (mp) {
    try {
      mp.reset();
    } catch (error) {
      reportProviderFailure('Mixpanel', 'reset', error);
    }
  }

  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
      await firebase.sdk.setUserId(firebase.instance, null);
      await firebase.sdk.resetAnalyticsData(firebase.instance);
    } catch (error) {
      reportProviderFailure('Firebase', 'reset', error);
    }
  }

  analyticsUserId = null;
  installDate = null;
  currentScreen = null;
  lastFirebaseScreen = null;
  analyticsReadyPromise = new Promise<void>((resolve) => {
    resolveAnalyticsReady = resolve;
  });
}
