import React from 'react';
import { View, type ViewProps } from 'react-native';

import { ColumnGutterProvider } from '~/components/layout/ColumnGutter';
import { useContentFrame } from '~/components/layout/ContentFrame';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';

interface TabletContentContainerProps extends ViewProps {
  children: React.ReactNode;
  /**
   * Column width on a tablet or in the open Duo's fold frame, for a page with
   * a wide layout of its own (`useWideTabColumns`). Defaults to the readable
   * column.
   */
  maxWidth?: number | null;
}

export function TabletContentContainer({
  children,
  style,
  maxWidth,
  ...props
}: TabletContentContainerProps) {
  const { isTablet, wideTabs } = useDeviceLayout();
  // The open Duo's fold frame is laid out like a tablet page: the wide page
  // takes it all (`maxWidth`), anything nested in it the readable column.
  const { width: frameWidth, onFold = false } = useContentFrame();

  if (!isTablet && !onFold) {
    return <>{children}</>;
  }

  const columnWidth = maxWidth ?? TABLET_CONTENT_MAX_WIDTH;
  return (
    <ColumnGutterProvider
      gutter={wideTabs || onFold ? Math.max(0, (frameWidth - columnWidth) / 2) : 0}
    >
      <View
        style={[{ maxWidth: columnWidth, width: '100%', alignSelf: 'center' }, style]}
        {...props}
      >
        {children}
      </View>
    </ColumnGutterProvider>
  );
}
