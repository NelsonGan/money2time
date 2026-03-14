import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  areAdsUnlocked,
  ADS_INITIAL_COOLDOWN_HOURS,
  getAdsCooldownState,
  type AdsCooldownState,
  type AdsVisibilityOptions,
} from './adsShared';

const ADMOB_BANNER_UNIT_ID_PATTERN = /^ca-app-pub-\d{16}\/\d{10,}$/;

function shouldUseTestAdUnits() {
  return __DEV__ || process.env.EXPO_PUBLIC_ADMOB_FORCE_TEST_IDS === 'true';
}

function isExpoGo() {
  return Constants.executionEnvironment === 'storeClient';
}

function getTestBannerAdUnitId() {
  return (
    Platform.select({
      android: 'ca-app-pub-3940256099942544/6300978111',
      ios: 'ca-app-pub-3940256099942544/2934735716',
      default: null,
    }) ?? null
  );
}

function getConfiguredBannerAdUnitId() {
  const unitId = Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
    default: undefined,
  });

  const normalized = unitId?.trim();
  if (!normalized) {
    return null;
  }

  if (ADMOB_BANNER_UNIT_ID_PATTERN.test(normalized)) {
    return normalized;
  }

  if (__DEV__) {
    console.warn('Ignoring invalid AdMob banner unit ID from environment.');
  }

  return null;
}

function areAdsEnabled(options: AdsVisibilityOptions = {}) {
  return areAdsUnlocked(options);
}

export function getBannerAdUnitId() {
  if (isExpoGo()) {
    return null;
  }

  if (shouldUseTestAdUnits()) {
    return getTestBannerAdUnitId();
  }

  return getConfiguredBannerAdUnitId();
}

function isBannerAdUnitAvailable() {
  return getBannerAdUnitId() !== null;
}

export function canRequestBannerAds(options: AdsVisibilityOptions = {}) {
  return areAdsEnabled(options) && isBannerAdUnitAvailable();
}

export { ADS_INITIAL_COOLDOWN_HOURS, getAdsCooldownState };
export type { AdsCooldownState, AdsVisibilityOptions };

let mobileAdsInitializationPromise: Promise<void> | null = null;

export function initializeGoogleMobileAds() {
  if (!isBannerAdUnitAvailable()) {
    return Promise.resolve();
  }

  if (!mobileAdsInitializationPromise) {
    mobileAdsInitializationPromise = import('react-native-google-mobile-ads')
      .then((googleMobileAds) =>
        googleMobileAds
          .default()
          .setRequestConfiguration({
            maxAdContentRating: googleMobileAds.MaxAdContentRating.PG,
          })
          .then(() => googleMobileAds.default().initialize()),
      )
      .then(() => undefined)
      .catch((error) => {
        mobileAdsInitializationPromise = null;
        if (__DEV__) {
          console.warn('Google Mobile Ads initialization failed:', error);
        }
      });
  }

  return mobileAdsInitializationPromise;
}
