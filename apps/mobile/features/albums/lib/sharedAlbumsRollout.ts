// The shared-albums rollout (the `shared_albums` feature flag), kept pure for tests.

import type { FeatureFlagValue } from '~/services/featureFlags';

/**
 * Whether this user may make a shared album, from the `shared_albums` flag.
 * Only `true` lets them: off, a variant string, or an unknown answer (flags
 * not loaded yet, PostHog unreachable or over quota) keeps the switch hidden.
 * A development build without flags (they load only with
 * EXPO_PUBLIC_POSTHOG_DEV=1) counts as allowed, so local work sees the switch.
 *
 * Only making one is gated. Joining from a link, and everything a shared
 * album does once on the phone, never read this flag: someone off the rollout
 * who is sent a link joins and uses the album as anyone on it does.
 */
export function sharedAlbumsAllowed(flag: FeatureFlagValue, isDev: boolean): boolean {
  if (flag !== undefined) return flag === true;
  return isDev;
}
