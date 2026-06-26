import React, { createContext, useContext, useMemo } from 'react';
import type { ThemeColor } from '~/types';

type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  resolvedTheme: ResolvedTheme;
  themeColor: ThemeColor;
}

const ThemeContext = createContext<ThemeContextValue>({
  resolvedTheme: 'light',
  themeColor: 'rosewood',
});

export function ThemeProvider({
  resolvedTheme,
  themeColor,
  children,
}: {
  resolvedTheme: ResolvedTheme;
  themeColor: ThemeColor;
  children: React.ReactNode;
}) {
  // Memoize so the context value identity is stable across re-renders of this
  // provider (ThemeGate re-renders on every AppContext data mutation). Without
  // this, every theme consumer in the app re-renders on each transaction edit,
  // FX refresh, etc. — even when the theme has not changed.
  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, themeColor }),
    [resolvedTheme, themeColor],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext).resolvedTheme;
}

export function useThemeColor(): ThemeColor {
  return useContext(ThemeContext).themeColor;
}
