import { Clock3 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';

import { Text } from './text';

export const TIME_VALUE_ICON = Clock3;
export const TIME_VALUE_ICON_STROKE_WIDTH = 2;

type TextProps = React.ComponentProps<typeof Text>;

interface TimeValueInlineProps extends Omit<TextProps, 'children' | 'className'> {
  value: string;
  containerClassName?: string;
  textClassName?: string;
  iconColor?: string;
  iconSize?: number;
  iconStrokeWidth?: number;
}

export function TimeValueInline({
  value,
  containerClassName,
  textClassName,
  iconColor,
  iconSize = 12,
  iconStrokeWidth = TIME_VALUE_ICON_STROKE_WIDTH,
  variant = 'body',
  tone = 'default',
  ...textProps
}: TimeValueInlineProps) {
  const themeColors = useThemeColors();
  const Icon = TIME_VALUE_ICON;

  return (
    <View className={cn('flex-row items-center gap-1', containerClassName)}>
      <Icon
        size={iconSize}
        color={iconColor ?? themeColors.textMuted}
        strokeWidth={iconStrokeWidth}
      />
      <Text variant={variant} tone={tone} className={textClassName} {...textProps}>
        {value}
      </Text>
    </View>
  );
}
