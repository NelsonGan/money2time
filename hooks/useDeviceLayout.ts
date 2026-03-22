import { useMemo } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';

const TABLET_CONTENT_MAX_WIDTH = 600;
const TABLET_MIN_DIMENSION = 768;

function isTabletSize(width: number, height: number) {
  if (Platform.OS === 'ios' && Platform.isPad) {
    return true;
  }

  return Math.min(width, height) >= TABLET_MIN_DIMENSION;
}

const initialWindow = Dimensions.get('window');
const IS_TABLET = isTabletSize(initialWindow.width, initialWindow.height);

export function useDeviceLayout() {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const isTablet = isTabletSize(width, height);
    const isLandscape = width > height;
    const contentWidth = isTablet ? Math.min(width, TABLET_CONTENT_MAX_WIDTH) : width;
    const tabletPadding = isTablet ? Math.max(0, (width - TABLET_CONTENT_MAX_WIDTH) / 2) : 0;
    return {
      isTablet,
      isLandscape,
      screenWidth: width,
      screenHeight: height,
      contentWidth,
      tabletPadding,
    };
  }, [width, height]);
}

export { IS_TABLET, TABLET_CONTENT_MAX_WIDTH, isTabletSize };
