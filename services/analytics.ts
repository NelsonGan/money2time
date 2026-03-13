/**
 * Web / unsupported-platform fallback for analytics.
 *
 * All functions are safe no-ops so the rest of the app can import from
 * `~/services/analytics` without platform guards.
 */

import type { AnalyticsProperties, AnalyticsSuperProperties } from './analytics.shared';

export * from './analytics.shared';

export async function identifyUser(_appUserId: string): Promise<void> {}

export async function trackEvent(
  _eventName: string,
  _properties?: AnalyticsProperties,
): Promise<void> {}

export async function setSuperProperties(_properties: AnalyticsSuperProperties): Promise<void> {}

export async function setUserProperties(
  _properties: Record<string, string | number | boolean>,
): Promise<void> {}

export async function resetAnalytics(): Promise<void> {}
