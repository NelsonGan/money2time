// Pure so it can be tested without React Native: call sites pass
// `Platform.OS` and `Platform.Version` in.

/** iOS 27 is where Shortcuts can share an automation with its trigger attached. */
export const SHARED_AUTOMATIONS_MIN_IOS = 27;

/**
 * The major iOS version, or null on any other platform. React Native reports
 * iOS's version as a string such as "27.0.1"; Android's is an API level number,
 * which is why the platform has to be checked rather than the value's type.
 */
export function iosMajorVersion(os: string, version: string | number): number | null {
  if (os !== 'ios') return null;
  const major = Number.parseInt(String(version), 10);
  return Number.isFinite(major) ? major : null;
}

/** True on iOS `min` or later. Always false off iOS. */
export function isIosAtLeast(os: string, version: string | number, min: number): boolean {
  const major = iosMajorVersion(os, version);
  return major !== null && major >= min;
}

/**
 * True when the automation tutorials can hand out a ready-made automation
 * (trigger included) instead of walking through building one.
 */
export function supportsSharedAutomations(os: string, version: string | number): boolean {
  return isIosAtLeast(os, version, SHARED_AUTOMATIONS_MIN_IOS);
}
