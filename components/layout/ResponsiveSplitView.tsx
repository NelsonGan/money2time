import React from 'react';
import { View, type ViewProps } from 'react-native';

import { useDeviceLayout } from '~/hooks/useDeviceLayout';

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
  style,
  ...props
}: ResponsiveSplitViewProps) {
  const { isExpandedTablet, isRegularTablet, paneGap } = useDeviceLayout();
  const isSplit = isExpandedTablet || (splitOnRegular && isRegularTablet);

  if (!isSplit) {
    return (
      <View className="flex-1" style={style} {...props}>
        {primary}
        {secondary}
      </View>
    );
  }

  return (
    <View className="flex-1 flex-row" style={[{ gap: paneGap }, style]} {...props}>
      <View style={{ flexBasis: primaryBasis, flexGrow: 1, flexShrink: 1 }}>{primary}</View>
      <View style={{ flexBasis: secondaryBasis, flexGrow: 1, flexShrink: 1 }}>{secondary}</View>
    </View>
  );
}
