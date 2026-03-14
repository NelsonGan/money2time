import {
  areAdsUnlocked,
  ADS_INITIAL_COOLDOWN_HOURS,
  getAdsCooldownState,
  type AdsCooldownState,
  type AdsVisibilityOptions,
} from './adsShared';

function areAdsEnabled(options: AdsVisibilityOptions = {}) {
  return areAdsUnlocked(options);
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

export { ADS_INITIAL_COOLDOWN_HOURS, getAdsCooldownState };
export type { AdsCooldownState, AdsVisibilityOptions };

export async function initializeGoogleMobileAds() {
  return;
}
