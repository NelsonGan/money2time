import React from 'react';
import { type LayoutChangeEvent, View, type ViewProps } from 'react-native';

import { spacing } from '~/constants/designSystem';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';

interface ResponsiveGridProps extends ViewProps {
  children: React.ReactNode;
  /** Optional cap for screens whose cards become too small at the global tier count. */
  maxColumns?: number;
  minItemWidth?: number;
  gap?: number;
}

/**
 * Wraps cards into equal-width columns using the width actually granted by its
 * parent. Compact layouts stay single-column unless there is enough real room.
 */
export function ResponsiveGrid({
  children,
  maxColumns,
  minItemWidth = 220,
  gap = spacing.md,
  style,
  ...props
}: ResponsiveGridProps) {
  const { gridColumns } = useDeviceLayout();
  const [width, setWidth] = React.useState(0);
  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const items = React.Children.toArray(children);
  const widthColumns =
    width > 0 ? Math.max(1, Math.floor((width + gap) / (minItemWidth + gap))) : 1;
  const columns = Math.max(1, Math.min(gridColumns, widthColumns, maxColumns ?? gridColumns));
  const itemWidth = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;

  return (
    <View
      onLayout={handleLayout}
      className="flex-row flex-wrap"
      style={[{ gap }, style]}
      {...props}
    >
      {itemWidth > 0
        ? items.map((child, index) => (
            <View key={index} style={{ width: itemWidth }}>
              {child}
            </View>
          ))
        : null}
    </View>
  );
}
