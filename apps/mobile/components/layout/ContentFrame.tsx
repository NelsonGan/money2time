import React, { createContext, useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export interface ContentFrame {
  width: number;
  height: number;
}

const ContentFrameContext = createContext<ContentFrame | null>(null);

/**
 * Declares the area its children are laid out in when that is smaller than
 * the window: a screen beside the iPhone Duo's side rail, or one pane of the
 * open Duo. Without a provider the frame is the window, so phones, tablets
 * and Android lay out exactly as before.
 */
export function ContentFrameProvider({
  width,
  height,
  children,
}: ContentFrame & { children: React.ReactNode }) {
  const value = useMemo(() => ({ width, height }), [width, height]);
  return <ContentFrameContext.Provider value={value}>{children}</ContentFrameContext.Provider>;
}

/**
 * Size of the area this component is laid out in. Use it instead of
 * `useWindowDimensions()` for anything sized to the screen's width (pager
 * pages, charts, grids), so it stays right beside a side rail or in a pane.
 */
export function useContentFrame(): ContentFrame {
  const window = useWindowDimensions();
  const frame = useContext(ContentFrameContext);
  return frame ?? { width: window.width, height: window.height };
}
