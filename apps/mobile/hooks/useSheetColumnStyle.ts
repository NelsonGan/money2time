import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';

const SHEET_COLUMN_STYLE: ViewStyle = {
  width: '100%',
  maxWidth: TABLET_CONTENT_MAX_WIDTH,
  alignSelf: 'center',
};

/**
 * Style for a bottom sheet's panel: centred in a readable column in a wide
 * window (the open iPhone Duo, iPad), the way iOS presents sheets there, so
 * it never spans the fold or the whole iPad. Undefined (full width,
 * unchanged) everywhere else, or also centred on other tablets for the
 * sheets that already did that.
 */
export function useSheetColumnStyle({ onTablet = false } = {}): ViewStyle | undefined {
  const { isWide, isTablet } = useDeviceLayout();
  const centred = isWide || (onTablet && isTablet);
  return useMemo(() => (centred ? SHEET_COLUMN_STYLE : undefined), [centred]);
}
