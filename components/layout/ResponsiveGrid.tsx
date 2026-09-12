import React from 'react';
import { type LayoutChangeEvent, View, type ViewProps } from 'react-native';

import { spacing } from '~/constants/designSystem';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { cn } from '~/utils';

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
  className,
  onLayout,
  style,
  ...props
}: ResponsiveGridProps) {
  const { gridColumns } = useDeviceLayout();
  const [width, setWidth] = React.useState(0);
  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      setWidth(event.nativeEvent.layout.width);
      onLayout?.(event);
    },
    [onLayout],
  );
  const items = React.Children.toArray(children);
  const widthColumns =
    width > 0 ? Math.max(1, Math.floor((width + gap) / (minItemWidth + gap))) : 1;
  const columns = Math.max(1, Math.min(gridColumns, widthColumns, maxColumns ?? gridColumns));
  const itemWidth = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;

  return (
    <View
      {...props}
      onLayout={handleLayout}
      className={cn('flex-row flex-wrap', className)}
      style={[{ gap }, style]}
    >
      {itemWidth > 0
        ? items.map((child, index) => (
            <View
              key={React.isValidElement(child) && child.key != null ? child.key : index}
              style={{ width: itemWidth }}
            >
              {child}
            </View>
          ))
        : null}
    </View>
  );
}
