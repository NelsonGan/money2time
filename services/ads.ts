interface AdsVisibilityOptions {
  hasAdFreeEntitlement?: boolean;
}

function areAdsEnabled(options: AdsVisibilityOptions = {}) {
  return !options.hasAdFreeEntitlement;
}

export function getBannerAdUnitId() {
  return null;
}

function isBannerAdUnitAvailable() {
  return false;
}

export function canRequestBannerAds(options: AdsVisibilityOptions = {}) {
  return areAdsEnabled(options) && isBannerAdUnitAvailable();
}

export async function initializeGoogleMobileAds() {
  return;
}
