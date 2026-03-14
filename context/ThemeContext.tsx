import React, { createContext, useContext } from 'react';
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
  return (
    <ThemeContext.Provider value={{ resolvedTheme, themeColor }}>{children}</ThemeContext.Provider>
  );
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext).resolvedTheme;
}

export function useThemeColor(): ThemeColor {
  return useContext(ThemeContext).themeColor;
}
