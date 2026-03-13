/**
 * Native Mixpanel analytics integration.
 *
 * Initialises the Mixpanel SDK on first call, identifies the user with the
 * same appUserId used by RevenueCat, and exposes a thin `track` / `identify`
 * surface consumed by the rest of the app.
 */

import { Mixpanel } from 'mixpanel-react-native';
import { Platform } from 'react-native';

import type { AnalyticsProperties, AnalyticsSuperProperties } from './analytics.shared';

export * from './analytics.shared';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mixpanelInstance: Mixpanel | null = null;
let initPromise: Promise<void> | null = null;
let identifiedUserId: string | null = null;

function getMixpanelToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN?.trim();
  return token || null;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function ensureInitialized(): Promise<Mixpanel | null> {
  const token = getMixpanelToken();
  if (!token) return null;

  if (mixpanelInstance) return mixpanelInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const mp = new Mixpanel(token, true);
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

  if (properties) {
    mp.track(eventName, properties);
  } else {
    mp.track(eventName);
  }
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
 * Reset Mixpanel state (e.g. on data reset / logout).
 */
export async function resetAnalytics(): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.reset();
  identifiedUserId = null;
}
