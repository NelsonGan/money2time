import { useMemo } from 'react';
import { vars } from 'nativewind';
import { useResolvedTheme } from '~/context/ThemeContext';
import { lightCssVars, darkCssVars } from '~/constants/designSystem';

/**
 * Returns a NativeWind `vars()` style object that sets all CSS custom properties
 * for the current color scheme. Apply this to the root View of any Modal or
 * detached view hierarchy so Tailwind color utilities resolve correctly.
 */
export function useThemeVars() {
  const resolved = useResolvedTheme();
  return useMemo(() => vars(resolved === 'dark' ? darkCssVars : lightCssVars), [resolved]);
}
