import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { FONT } from '~/utils/fonts';

const APP_LOGO_SOURCE = require('../../assets/app-icons/classic/icon-light.png');

/** Mirrors the native widget wordmark, using the shipped launcher headshot. */
export function WidgetWordmark({ width = 116 }: { width?: number }) {
  const themeColors = useThemeColors();
  const size = width * 0.22;

  return (
    <View
      accessible
      accessibilityLabel="Money2Time"
      className="flex-row items-center"
      style={{ width, height: width * 0.27, gap: width * 0.04 }}
    >
      <Image
        source={APP_LOGO_SOURCE}
        contentFit="contain"
        style={{ width: size, height: size, borderRadius: size * 0.24 }}
      />
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        className="flex-1"
        style={{ fontFamily: FONT.extrabold, fontSize: width * 0.12, color: themeColors.primary }}
      >
        Money2Time
      </Text>
    </View>
  );
}
