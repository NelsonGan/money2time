import { useResolvedTheme } from '~/context/ThemeContext';
import { colors, darkColors, type ColorPalette } from '~/constants/designSystem';

/**
 * Returns the correct color palette based on the resolved theme.
 * Use this wherever JS code needs theme-aware color values (icon tints, chart configs, etc.).
 */
export function useThemeColors(): ColorPalette {
  const resolved = useResolvedTheme();
  return resolved === 'dark' ? darkColors : colors;
}
