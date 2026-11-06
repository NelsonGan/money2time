import React, { createContext, useContext } from 'react';
import { View, type ViewProps } from 'react-native';

const ColumnGutterContext = createContext(0);

/**
 * Declares how far the readable column its children are laid out in sits
 * from the window's right edge, on top of any column it is already inside.
 * Only set in a wide window (iPad, the open iPhone Duo); 0 everywhere else,
 * so nothing moves on a phone or the closed Duo.
 */
export function ColumnGutterProvider({
  gutter,
  children,
}: {
  gutter: number;
  children: React.ReactNode;
}) {
  const inherited = useContext(ColumnGutterContext);
  if (gutter <= 0) return <>{children}</>;
  return (
    <ColumnGutterContext.Provider value={inherited + gutter}>
      {children}
    </ColumnGutterContext.Provider>
  );
}

/**
 * Space between this component's readable column and the window's right
 * edge. A floating button positioned against the column's right edge
 * subtracts it from `right` to sit in the window's corner instead of over the
 * column's content (iPad, the open Duo); 0 elsewhere.
 */
export function useColumnGutter(): number {
  return useContext(ColumnGutterContext);
}

/**
 * An absolutely positioned view `right` points from its column's right edge,
 * moved out to the window's corner on iPad and the open Duo
 * (`useColumnGutter`). For floating buttons rendered inside a readable column.
 */
export function ColumnCornerView({ right, style, ...props }: ViewProps & { right: number }) {
  const gutter = useColumnGutter();
  return <View {...props} style={[style, { right: right - gutter }]} />;
}
