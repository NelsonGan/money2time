import React from 'react';
import { View, type ViewProps } from 'react-native';

import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';

interface TabletContentContainerProps extends ViewProps {
  children: React.ReactNode;
  /**
   * Column width on a tablet, for a page with a wide layout of its own
   * (`useWideTabColumns`). Defaults to the readable column.
   */
  maxWidth?: number | null;
}

export function TabletContentContainer({
  children,
  style,
  maxWidth,
  ...props
}: TabletContentContainerProps) {
  const { isTablet } = useDeviceLayout();

  if (!isTablet) {
    return <>{children}</>;
  }

  return (
    <View
      style={[
        { maxWidth: maxWidth ?? TABLET_CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
