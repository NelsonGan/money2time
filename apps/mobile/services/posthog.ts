/**
 * Web / test / unsupported-platform fallback: PostHog is native-only in the
 * app, so there is never a client. The real client lives in `posthog.native.ts`.
 */

import type { PostHog } from 'posthog-react-native';

export function getAppVariant(): string {
  return 'production';
}

export function isAllowedPostHogEvent(_event: string): boolean {
  return false;
}

export function initPostHog(): PostHog | null {
  return null;
}

export function getPostHog(): PostHog | null {
  return null;
}
