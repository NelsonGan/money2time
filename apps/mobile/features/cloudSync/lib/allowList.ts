// The Cloud Sync allow list (the `cloud_sync` feature flag), kept pure for tests.

import type { FeatureFlagValue } from '~/services/featureFlags';

/**
 * Whether the Cloud Sync UI is allowed, from the `cloud_sync` allow-list flag:
 * undefined while the flag is unknown. A development build without flags
 * (they load only with EXPO_PUBLIC_POSTHOG_DEV) counts as allowed.
 */
export function cloudSyncAllowed(flag: FeatureFlagValue, isDev: boolean): boolean | undefined {
  if (flag !== undefined) return flag === true;
  return isDev ? true : undefined;
}
