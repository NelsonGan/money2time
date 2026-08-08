import React, { createContext, useContext, useMemo } from 'react';
import type { IconStyle, ThemeColor } from '~/types';

type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  resolvedTheme: ResolvedTheme;
  themeColor: ThemeColor;
  iconStyle: IconStyle;
}

const ThemeContext = createContext<ThemeContextValue>({
  resolvedTheme: 'light',
  themeColor: 'rosewood',
  // Clay is the default look, and it is also what a consumer rendered outside
  // the provider (an error boundary above ThemeGate) should fall back to.
  iconStyle: 'clay',
});

export function ThemeProvider({
  resolvedTheme,
  themeColor,
  iconStyle,
  children,
}: {
  resolvedTheme: ResolvedTheme;
  themeColor: ThemeColor;
  iconStyle: IconStyle;
  children: React.ReactNode;
}) {
  // Memoize so the context value identity is stable across re-renders of this
  // provider (ThemeGate re-renders on every AppContext data mutation). Without
  // this, every theme consumer in the app re-renders on each transaction edit,
  // FX refresh, etc. — even when the theme has not changed.
  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, themeColor, iconStyle }),
    [resolvedTheme, themeColor, iconStyle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext).resolvedTheme;
}

export function useThemeColor(): ThemeColor {
  return useContext(ThemeContext).themeColor;
}

/**
 * Which artwork the app's own chrome draws. Read this wherever the flat option
 * needs more than an icon swap — a tinted plate, a filled disc or a coloured
 * tint that clay deliberately does without.
 */
export function useIconStyle(): IconStyle {
  return useContext(ThemeContext).iconStyle;
}

/** Convenience for the common `useIconStyle() === 'flat'` branch. */
export function useIsFlatIcons(): boolean {
  return useContext(ThemeContext).iconStyle === 'flat';
}
