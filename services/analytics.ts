/**
 * Web / unsupported-platform fallback for analytics.
 *
 * All functions are safe no-ops so the rest of the app can import from
 * `~/services/analytics` without platform guards.
 */

import type {
  AnalyticsEventName,
  AnalyticsProperties,
  AnalyticsSuperProperties,
} from './analytics.shared';

export * from './analytics.shared';

export async function identifyUser(_appUserId: string): Promise<void> {}

export async function getFirebaseAppInstanceId(_appUserId: string): Promise<string | null> {
  return null;
}

export async function markRevenueCatRevenueSource(_appUserId: string): Promise<boolean> {
  return false;
}

export async function setInstallDate(_firstAppOpen: string | null): Promise<void> {}

export async function trackEvent(
  _eventName: AnalyticsEventName,
  _properties?: AnalyticsProperties,
): Promise<void> {}

export async function recordLoggedTransaction(): Promise<void> {}

export async function setCurrentScreen(_screen: string | null): Promise<void> {}

export async function setSuperProperties(
  _properties: AnalyticsSuperProperties,
  _expectedAppUserId?: string,
): Promise<boolean> {
  return true;
}

export async function setUserProperties(
  _properties: Record<string, string | number | boolean>,
  _expectedAppUserId?: string,
): Promise<boolean> {
  return true;
}

export async function flushAnalytics(): Promise<void> {}

export async function resetAnalytics(): Promise<void> {}
