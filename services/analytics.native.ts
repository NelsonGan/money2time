/**
 * Native Mixpanel analytics integration.
 *
 * Initialises the Mixpanel SDK on first call, identifies the user with the
 * same appUserId used by RevenueCat, and exposes a thin `track` / `identify`
 * surface consumed by the rest of the app.
 *
 * The SDK is loaded via lazy `require()` so the bundle doesn't break in
 * Expo Go where native modules aren't available.
 */

import { NativeModules, Platform } from 'react-native';

import type { AnalyticsProperties, AnalyticsSuperProperties } from './analytics.shared';

export * from './analytics.shared';

// Lazy SDK resolution – returns null in Expo Go

type MixpanelInstance = any;

let hasWarnedMissingMixpanelToken = false;
let hasWarnedMissingMixpanelSdk = false;
let hasWarnedUsingMixpanelJsMode = false;

function warnMissingMixpanelToken() {
  if (!__DEV__ || hasWarnedMissingMixpanelToken) return;

  hasWarnedMissingMixpanelToken = true;
  console.warn('[Analytics] EXPO_PUBLIC_MIXPANEL_TOKEN is missing. Mixpanel tracking is disabled.');
}

function warnMissingMixpanelSdk(error?: unknown) {
  if (!__DEV__ || hasWarnedMissingMixpanelSdk) return;

  hasWarnedMissingMixpanelSdk = true;
  console.warn(
    '[Analytics] mixpanel-react-native is unavailable. Rebuild the native app after installing native dependencies; Expo Go does not support this module.',
    error,
  );
}

function warnUsingMixpanelJsMode() {
  if (!__DEV__ || hasWarnedUsingMixpanelJsMode) return;

  hasWarnedUsingMixpanelJsMode = true;
  console.warn(
    '[Analytics] Mixpanel native module is unavailable in this build. Falling back to JavaScript mode.',
  );
}

function isMixpanelNativeModuleAvailable(): boolean {
  return Boolean(NativeModules.MixpanelReactNative);
}

function getMixpanelClass(): (new (...args: unknown[]) => MixpanelInstance) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mixpanel-react-native').Mixpanel;
  } catch (error) {
    warnMissingMixpanelSdk(error);
    return null;
  }
}

// Module state

let mixpanelInstance: MixpanelInstance | null = null;
let initPromise: Promise<void> | null = null;
let identifiedUserId: string | null = null;
let currentScreen: string | null = null;

function getMixpanelToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN?.trim();
  return token || null;
}

// Initialisation

async function ensureInitialized(): Promise<MixpanelInstance | null> {
  const token = getMixpanelToken();
  if (!token) {
    warnMissingMixpanelToken();
    return null;
  }

  if (mixpanelInstance) return mixpanelInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const MixpanelClass = getMixpanelClass();
      if (!MixpanelClass) return;

      const useNativeMixpanel = isMixpanelNativeModuleAvailable();

      if (!useNativeMixpanel) {
        warnUsingMixpanelJsMode();
      }

      const mp = new MixpanelClass(token, true, useNativeMixpanel);
      await mp.init();
      mixpanelInstance = mp;
    })().catch((error) => {
      initPromise = null;
      if (__DEV__) {
        console.warn('[Analytics] Mixpanel init failed:', error);
      }
    });
  }

  await initPromise;
  return mixpanelInstance;
}

// Public API

/**
 * Identify the user so all subsequent events are attributed to them.
 * Uses the same `appUserId` (e.g. `m2t_<uuid>`) that RevenueCat uses.
 */
export async function identifyUser(appUserId: string): Promise<void> {
  if (!appUserId || appUserId === identifiedUserId) return;

  const mp = await ensureInitialized();
  if (!mp) return;

  mp.identify(appUserId);
  identifiedUserId = appUserId;

  mp.getPeople().set('$name', appUserId);
  mp.getPeople().set('platform', Platform.OS);
}

/**
 * Track a single event with optional properties.
 */
export async function trackEvent(
  eventName: string,
  properties?: AnalyticsProperties,
): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  const nextCurrentScreen =
    typeof properties?.current_screen === 'string'
      ? properties.current_screen
      : typeof properties?.screen === 'string'
        ? properties.screen
        : typeof properties?.tab === 'string'
          ? properties.tab
          : currentScreen;
  const eventProperties = nextCurrentScreen
    ? { ...properties, current_screen: nextCurrentScreen }
    : properties;

  if (eventProperties) {
    mp.track(eventName, eventProperties);
  } else {
    mp.track(eventName);
  }
}

/**
 * Keep Mixpanel's `current_screen` in sync with the visible app screen.
 */
export async function setCurrentScreen(screen: string | null): Promise<void> {
  if (screen === currentScreen) return;

  currentScreen = screen;
  if (!screen) return;

  const mp = await ensureInitialized();
  if (!mp) return;

  mp.registerSuperProperties({ current_screen: screen });
}

/**
 * The screen the user is on right now, for a caller that has to attribute an
 * event to *when it happened* rather than when it is sent. `trackEvent` reads
 * this after awaiting SDK init, so an event flushed as the user navigates away
 * would otherwise land on the screen they moved to.
 */
export function getCurrentScreen(): string | null {
  return currentScreen;
}

/**
 * Register super-properties that are sent with every subsequent event.
 */
export async function setSuperProperties(properties: AnalyticsSuperProperties): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.registerSuperProperties(properties);
}

/**
 * Set user profile properties (People).
 */
export async function setUserProperties(
  properties: Record<string, string | number | boolean>,
): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.getPeople().set(properties);
}

/**
 * Flush queued events immediately.
 */
export async function flushAnalytics(): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.flush();
}

/**
 * Reset Mixpanel state (e.g. on data reset / logout).
 */
export async function resetAnalytics(): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.reset();
  identifiedUserId = null;
  currentScreen = null;
}
