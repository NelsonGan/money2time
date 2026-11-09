type MobilePlatform = "android" | "ios";
export type DownloadTarget = "app_store" | "google_play" | "none";

const PRODUCTION_HOSTS = new Set(["money2time.com", "www.money2time.com", "app.money2time.com"]);

/**
 * The Web Dashboard lives on its own host. The same Next.js app
 * serves it; `src/proxy.ts` sends every path on an `app.` host to the
 * dashboard route. `app.localhost` stands in for it in development.
 */
export const APP_ORIGIN = "https://app.money2time.com";

/**
 * The dashboard in the visitor's language. English is unprefixed there as
 * here; the app host's proxy reads any other prefix.
 */
export function appUrl(locale: string): string {
  return locale === "en" ? APP_ORIGIN : `${APP_ORIGIN}/${locale}`;
}

export function isAppHost(hostname: string): boolean {
  return hostname.startsWith("app.");
}

const IOS_PATTERN = /iphone|ipad|ipod/i;
const ANDROID_PATTERN = /android/i;
// Windows Phone user agents advertise "Android" for site compatibility.
const WINDOWS_PATTERN = /windows/i;

export function mobilePlatformFromUserAgent(
  userAgent: string | null | undefined,
): MobilePlatform | undefined {
  if (!userAgent) {
    return undefined;
  }

  if (IOS_PATTERN.test(userAgent)) {
    return "ios";
  }

  if (ANDROID_PATTERN.test(userAgent) && !WINDOWS_PATTERN.test(userAgent)) {
    return "android";
  }

  return undefined;
}

export function downloadTargetFromUserAgent(
  userAgent: string | null | undefined,
): DownloadTarget {
  const platform = mobilePlatformFromUserAgent(userAgent);
  if (platform === "ios") return "app_store";
  if (platform === "android") return "google_play";
  return "none";
}

export function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTS.has(hostname);
}
