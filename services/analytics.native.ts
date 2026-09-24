/**
 * Native product analytics integration.
 *
 * GA4 receives every event from every user. Mixpanel also receives every user,
 * but only the events in `MIXPANEL_EVENTS` (see `analytics.shared.ts`): it
 * bills per event, so it gets the install, activation and purchase funnels and
 * none of the product telemetry. Its automatic mobile events (`$ae_session`,
 * `$ae_first_open`, ...) are switched off for the same reason; `First App Open`
 * replaces the one worth keeping.
 */

import { NativeModules, Platform } from 'react-native';

import {
  type AnalyticsEventName,
  type AnalyticsProperties,
  type AnalyticsSuperProperties,
  daysSinceInstall,
  isMixpanelEvent,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
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
 * The marker the retired 50% cohort sampling registered on every event and
 * profile. The SDK persists super properties on the device, so it would ride on
 * every future event of a previously sampled user until explicitly removed.
 */
const RETIRED_SAMPLE_RATE_PROPERTY = 'sample_rate';

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
 * Drop the retired sampling marker from a previously sampled user's device and
 * profile. Keyed off the persisted super property itself, so it runs once per
 * affected install and is a single local read for everyone else.
 */
async function clearRetiredSampleRate(mp: MixpanelInstance): Promise<void> {
  const superProperties: Record<string, unknown> | null = await mp.getSuperProperties();
  if (!superProperties || !(RETIRED_SAMPLE_RATE_PROPERTY in superProperties)) return;
  mp.unregisterSuperProperty(RETIRED_SAMPLE_RATE_PROPERTY);
  mp.getPeople().unset(RETIRED_SAMPLE_RATE_PROPERTY);
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
      await clearRetiredSampleRate(mp);
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

/** Track every event in GA4, and the funnel events (`MIXPANEL_EVENTS`) in Mixpanel. */
export async function trackEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties,
): Promise<void> {
  const nextCurrentScreen =
    typeof properties?.current_screen === 'string'
      ? properties.current_screen
      : typeof properties?.screen === 'string'
        ? properties.screen
        : typeof properties?.tab === 'string'
          ? properties.tab
          : currentScreen;
  // The clock is read at the call so the age describes when the event happened,
  // but the install date after the wait: an event queued during launch fires
  // before the settings that carry it have loaded.
  const trackedAt = Date.now();
  await analyticsReadyPromise;

  const eventProperties: AnalyticsProperties = { ...properties };
  if (nextCurrentScreen) eventProperties.current_screen = nextCurrentScreen;
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
}

/** Keep provider screen context aligned with the visible React Navigation screen. */
export async function setCurrentScreen(screen: string | null): Promise<void> {
  if (screen === currentScreen) return;
  currentScreen = screen;
  if (!screen) return;
  await analyticsReadyPromise;
  if (screen !== currentScreen) return;

  const mp = await ensureMixpanelInitialized();
  if (mp) {
    try {
      mp.registerSuperProperties({ current_screen: screen });
    } catch (error) {
      reportProviderFailure('Mixpanel', 'screen context', error);
    }
  }
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

  const { current_screen: _currentScreen, ...stableProperties } = properties;
  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setUserProperties(
        firebase.instance,
        toGa4UserProperties(stableProperties),
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
