import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';

const SHEET_COLUMN_STYLE: ViewStyle = {
  width: '100%',
  maxWidth: TABLET_CONTENT_MAX_WIDTH,
  alignSelf: 'center',
};

/**
 * Style for a bottom sheet's panel: centred in a readable column on the open
 * iPhone Duo, the way iOS presents sheets there, so it never spans the fold
 * and the side rail. Undefined (full width, unchanged) everywhere else, or
 * also centred on tablets for the sheets that already did that.
 */
export function useSheetColumnStyle({ onTablet = false } = {}): ViewStyle | undefined {
  const { isTwoPane, isTablet } = useDeviceLayout();
  const centred = isTwoPane || (onTablet && isTablet);
  return useMemo(() => (centred ? SHEET_COLUMN_STYLE : undefined), [centred]);
}
