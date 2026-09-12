import React from 'react';
import { View, type ViewProps } from 'react-native';

import { useDeviceLayout } from '~/hooks/useDeviceLayout';

export type TabletContentVariant = 'readable' | 'form' | 'content' | 'wide' | 'fullBleed';

interface TabletContentContainerProps extends ViewProps {
  children: React.ReactNode;
  /** Content density to use on regular and expanded tablet canvases. */
  variant?: TabletContentVariant;
}

export function TabletContentContainer({
  children,
  style,
  variant = 'readable',
  ...props
}: TabletContentContainerProps) {
  const layout = useDeviceLayout();

  if (!layout.isTablet || layout.isCompact) {
    return <>{children}</>;
  }

  const maxWidth = {
    readable: layout.readableWidth,
    form: layout.formWidth,
    content: layout.contentWidth,
    wide: layout.wideWidth,
    fullBleed: layout.screenWidth,
  }[variant];

  return (
    <View style={[{ maxWidth, width: '100%', alignSelf: 'center' }, style]} {...props}>
      {children}
    </View>
  );
}
