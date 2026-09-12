import React, { createContext, useContext, useMemo } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';

import {
  resolveDeviceLayout,
  TABLET_CONTENT_MAX_WIDTH,
  TABLET_FORM_MAX_WIDTH,
  TABLET_READABLE_MAX_WIDTH,
  TABLET_WIDE_MAX_WIDTH,
} from '~/utils/deviceLayout';

const TABLET_MIN_DIMENSION = 768;

const ResponsiveViewportContext = createContext<number | undefined>(undefined);

function isTabletSize(width: number, height: number) {
  if (Platform.OS === 'ios' && Platform.isPad) {
    return true;
  }

  return Math.min(width, height) >= TABLET_MIN_DIMENSION;
}

const initialWindow = Dimensions.get('window');
const IS_TABLET = isTabletSize(initialWindow.width, initialWindow.height);

export function ResponsiveViewportProvider({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  return React.createElement(ResponsiveViewportContext.Provider, { value: width }, children);
}

export function useDeviceLayout() {
  const { width, height } = useWindowDimensions();
  const viewportWidth = useContext(ResponsiveViewportContext);

  return useMemo(
    () =>
      resolveDeviceLayout({
        windowWidth: width,
        windowHeight: height,
        isTablet: isTabletSize(width, height),
        viewportWidth,
      }),
    [height, viewportWidth, width],
  );
}

export {
  IS_TABLET,
  TABLET_CONTENT_MAX_WIDTH,
  TABLET_FORM_MAX_WIDTH,
  TABLET_READABLE_MAX_WIDTH,
  TABLET_WIDE_MAX_WIDTH,
  isTabletSize,
};
