/**
 * PostHog feature flags, for rolling out and A/B testing new features.
 *
 * Add every flag the app reads to `FEATURE_FLAGS` so its key lives in one
 * place, then read it with `useFeatureFlag` in components or `getFeatureFlag`
 * elsewhere. Both return `undefined` until flags have loaded (or when PostHog
 * is disabled, as on web and in development), so always treat `undefined` as
 * "off" and keep the current behavior as the default branch.
 *
 * Cost: flag requests are only billed while the project has at least one
 * active flag, and the SDK fetches flags once at launch and once on identify,
 * not on every read. Each read sends one `$feature_flag_called` per flag per
 * session (needed for experiment exposure), which counts against the event
 * budget; pass `{ sendEvent: false }` for reads that are not experiments.
 * Archive a flag in PostHog as soon as its rollout is complete.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { getPostHog } from './posthog';

/** Flag keys as configured in PostHog. Empty until the first flag ships. */
export const FEATURE_FLAGS = {} as const satisfies Record<string, string>;

export type FeatureFlagValue = boolean | string | undefined;

export interface FeatureFlagReadOptions {
  /** Send `$feature_flag_called` (experiment exposure). Defaults to true. */
  sendEvent?: boolean;
}

/** The flag's current value; `undefined` while unknown. */
export function getFeatureFlag(key: string, options?: FeatureFlagReadOptions): FeatureFlagValue {
  try {
    return getPostHog()?.getFeatureFlag(key, { sendEvent: options?.sendEvent ?? true });
  } catch {
    return undefined;
  }
}

/** The flag's JSON payload, if it has one. */
export function getFeatureFlagPayload(key: string): unknown {
  try {
    return getPostHog()?.getFeatureFlagResult(key, { sendEvent: false })?.payload;
  } catch {
    return undefined;
  }
}

function subscribe(onChange: () => void): () => void {
  const posthog = getPostHog();
  if (!posthog) return () => undefined;
  return posthog.onFeatureFlags(() => onChange());
}

/**
 * Subscribe a component to a flag. Re-renders when flags load or reload, and
 * reports exposure once the value is known (unless `sendEvent` is false).
 */
export function useFeatureFlag(key: string, options?: FeatureFlagReadOptions): FeatureFlagValue {
  const value = useSyncExternalStore(subscribe, () => getFeatureFlag(key, { sendEvent: false }));
  const sendEvent = options?.sendEvent ?? true;
  useEffect(() => {
    if (value !== undefined && sendEvent) getFeatureFlag(key, { sendEvent: true });
  }, [key, sendEvent, value]);
  return value;
}
