import React from 'react';
import { View, type ViewProps } from 'react-native';

import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';

interface TabletContentContainerProps extends ViewProps {
  children: React.ReactNode;
}

export function TabletContentContainer({ children, style, ...props }: TabletContentContainerProps) {
  const { isTablet } = useDeviceLayout();

  if (!isTablet) {
    return <>{children}</>;
  }

  return (
    <View
      style={[{ maxWidth: TABLET_CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' }, style]}
      {...props}
    >
      {children}
    </View>
  );
}
