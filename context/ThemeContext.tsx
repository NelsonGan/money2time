import React, { createContext, useContext } from 'react';

type ResolvedTheme = 'light' | 'dark';

const ThemeContext = createContext<ResolvedTheme>('light');

export function ThemeProvider({
  value,
  children,
}: {
  value: ResolvedTheme;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}
