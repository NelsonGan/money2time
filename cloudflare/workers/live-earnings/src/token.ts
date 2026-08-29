/**
 * Validation for an ActivityKit push token.
 *
 * The token is interpolated straight into the APNs request path, so it is
 * checked as strict hex rather than merely non-empty.
 *
 * The length bound is the part worth writing down. A classic APNs *device*
 * token is 32 bytes / 64 hex characters, and that is the number every example
 * on the internet uses - but a Live Activity token is a different thing and is
 * far longer: iOS 26 hands out 128 bytes / 256 hex characters, and Apple
 * documents no fixed size. Bounding this at 64 (or even 200) silently rejects
 * every real token, and because registration is best-effort on the app side the
 * only symptom is a card that never ticks. So the bound is deliberately loose:
 * wide enough for anything Apple plausibly issues, tight enough to stay a
 * sanity check.
 */
const MIN_HEX_CHARS = 32;
const MAX_HEX_CHARS = 1024;

export function isLiveActivityPushToken(value: string): boolean {
  return new RegExp(`^[0-9a-fA-F]{${MIN_HEX_CHARS},${MAX_HEX_CHARS}}$`).test(value);
}
