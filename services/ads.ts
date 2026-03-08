interface AdsVisibilityOptions {
  adsEnabled?: boolean;
  hasAdFreeEntitlement?: boolean;
}

export function areAdsEnabled(options: AdsVisibilityOptions = {}) {
  return options.adsEnabled !== false && !options.hasAdFreeEntitlement;
}

export function getBannerAdUnitId() {
  return null;
}

export function isBannerAdUnitAvailable() {
  return false;
}

export function canRequestBannerAds(options: AdsVisibilityOptions = {}) {
  return areAdsEnabled(options) && isBannerAdUnitAvailable();
}

export async function initializeGoogleMobileAds() {
  return;
}
