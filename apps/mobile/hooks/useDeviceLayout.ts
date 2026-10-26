import { useMemo } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useContentFrame } from '~/components/layout/ContentFrame';
import { READABLE_COLUMN_MAX_WIDTH, resolveAdaptiveLayout } from '~/utils/adaptiveLayout';

const TABLET_CONTENT_MAX_WIDTH = READABLE_COLUMN_MAX_WIDTH;
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
  // The area this screen is laid out in: the window, except beside iPhone
  // Duo's side rail or in a column on its open display.
  const { width: frameWidth } = useContentFrame();
  const insets = useSafeAreaInsets();
  const isPad = Platform.OS === 'ios' && Platform.isPad;
  return useMemo(() => {
    const isTablet = isTabletSize(width, height);
    const isLandscape = width > height;
    const contentWidth = isTablet ? Math.min(frameWidth, TABLET_CONTENT_MAX_WIDTH) : frameWidth;
    const tabletPadding = isTablet ? Math.max(0, (width - TABLET_CONTENT_MAX_WIDTH) / 2) : 0;
    // iPhone Duo only: side rail and two panes. Bottom bar everywhere else.
    const adaptive = resolveAdaptiveLayout({
      platform: Platform.OS,
      isPad,
      width,
      height,
      insets,
    });
    return {
      isTablet,
      isLandscape,
      screenWidth: width,
      screenHeight: height,
      contentWidth,
      tabletPadding,
      ...adaptive,
    };
  }, [width, height, frameWidth, insets, isPad]);
}

export { IS_TABLET, isTabletSize, TABLET_CONTENT_MAX_WIDTH };
