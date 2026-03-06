import { useMemo } from 'react';

import { useResolvedTheme, useThemeColor } from '~/context/ThemeContext';
import { getThemePalette, type ColorPalette } from '~/constants/designSystem';

/**
 * Returns the correct color palette based on the resolved theme.
 * Use this wherever JS code needs theme-aware color values (icon tints, chart configs, etc.).
 */
export function useThemeColors(): ColorPalette {
  const resolved = useResolvedTheme();
  const themeColor = useThemeColor();

  return useMemo(() => getThemePalette(themeColor, resolved), [resolved, themeColor]);
}
