import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { canRequestBannerAds, getBannerAdUnitId } from '~/services/ads';

export const APP_BANNER_AD_STRIP_HEIGHT = 84;

export function AppBannerAdStrip() {
  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  const { adRemovalState, settings } = useApp();
  const themeColors = useThemeColors();
  const unitId = getBannerAdUnitId();
  const shouldRender =
    !(adRemovalState.isConfigured && adRemovalState.isLoading) &&
    canRequestBannerAds({
      hasAdFreeEntitlement: adRemovalState.hasAdFreeEntitlement,
      installStartedAt: settings.createdAt,
    });
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [googleMobileAds, setGoogleMobileAds] = useState<
    typeof import('react-native-google-mobile-ads') | null
  >(null);
  const BannerAd = googleMobileAds?.BannerAd;
  const bannerSize = googleMobileAds?.BannerAdSize?.BANNER;

  useEffect(() => {
    setHasLoadFailed(false);
  }, [shouldRender, unitId]);

  useEffect(() => {
    if (isExpoGo) {
      setGoogleMobileAds(null);
      return;
    }

    let isActive = true;

    void import('react-native-google-mobile-ads')
      .then((module) => {
        if (!isActive) {
          return;
        }

        setGoogleMobileAds(module);
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('Failed to load Google Mobile Ads module:', error);
        }
        if (isActive) {
          setHasLoadFailed(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isExpoGo]);

  if (!shouldRender || !unitId || hasLoadFailed || !BannerAd || !bannerSize) {
    return null;
  }

  return (
    <View
      style={[
        styles.root,
        {
          borderTopColor: themeColors.border,
          backgroundColor: themeColors.background,
        },
      ]}
    >
      <View
        style={[
          styles.bannerShell,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
        ]}
      >
        <BannerAd
          key={unitId}
          unitId={unitId}
          size={bannerSize}
          onAdFailedToLoad={(error) => {
            if (__DEV__) {
              console.warn('Ad failed to load:', error.message);
            }
            setHasLoadFailed(true);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 2,
    width: '100%',
  },
  bannerShell: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: '100%',
  },
});
