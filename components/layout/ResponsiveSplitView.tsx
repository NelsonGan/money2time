import React from 'react';
import { View, type ViewProps } from 'react-native';

import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { cn } from '~/utils';

interface ResponsiveSplitViewProps extends ViewProps {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  primaryBasis?: number | `${number}%`;
  secondaryBasis?: number | `${number}%`;
  /** Regular-width iPads can opt into two panes when both panes remain useful. */
  splitOnRegular?: boolean;
}

export function ResponsiveSplitView({
  primary,
  secondary,
  primaryBasis = '58%',
  secondaryBasis = '42%',
  splitOnRegular = false,
  className,
  style,
  ...props
}: ResponsiveSplitViewProps) {
  const { isExpandedTablet, isRegularTablet, paneGap } = useDeviceLayout();
  const isSplit = isExpandedTablet || (splitOnRegular && isRegularTablet);

  if (!isSplit) {
    return (
      <View {...props} className={cn('flex-1', className)} style={style}>
        {primary}
        {secondary}
      </View>
    );
  }

  return (
    <View {...props} className={cn('flex-1 flex-row', className)} style={[{ gap: paneGap }, style]}>
      <View style={{ flexBasis: primaryBasis, flexGrow: 1, flexShrink: 1 }}>{primary}</View>
      <View style={{ flexBasis: secondaryBasis, flexGrow: 1, flexShrink: 1 }}>{secondary}</View>
    </View>
  );
}
