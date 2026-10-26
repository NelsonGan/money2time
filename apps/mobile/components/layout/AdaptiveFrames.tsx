import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentFrameProvider } from '~/components/layout/ContentFrame';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { readableColumn } from '~/utils/adaptiveLayout';

/*
 * The areas screens are laid out in on iPhone Duo. Each declares its size
 * through ContentFrameProvider, so widths read with `useContentFrame()` stay
 * right. On phones, tablets and Android the frame is the window.
 */

/**
 * The main tab shell's frame: the window less the side rail. Always rendered,
 * so the shell is not remounted when the rail comes or goes.
 */
export function ShellContentFrame({ children }: { children: React.ReactNode }) {
  const { navRailInset, screenWidth, screenHeight } = useDeviceLayout();
  return (
    <ContentFrameProvider width={screenWidth - navRailInset} height={screenHeight}>
      {children}
    </ContentFrameProvider>
  );
}

/**
 * A full-screen route, kept out of the strip the Duo reserves on one side
 * for its clock, camera and bars. The screens were laid out for a phone,
 * where that strip does not exist, so without this their headers and buttons
 * run under it. On the open display the route is also centred in a readable
 * column. Folding only changes padding, so the screen keeps its state. A
 * pass-through everywhere but the Duo.
 */
export function SideStripSafeArea({ children }: { children: React.ReactNode }) {
  const { navPlacement, isTwoPane, screenWidth, screenHeight } = useDeviceLayout();
  const { left, right } = useSafeAreaInsets();
  if (navPlacement !== 'side') return <>{children}</>;

  const column = readableColumn(screenWidth - left - right, isTwoPane);
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingLeft: left + column.margin, paddingRight: right + column.margin }}
    >
      <ContentFrameProvider width={column.width} height={screenHeight}>
        {children}
      </ContentFrameProvider>
    </View>
  );
}
