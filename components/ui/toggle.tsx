import React, { useCallback, useEffect } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springPresets } from '~/constants/motion';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { Text } from './text';

interface ToggleOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  options: ToggleOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  size?: 'default' | 'compact';
  variant?: 'default' | 'home';
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'default',
  variant = 'default',
}: SegmentedToggleProps<T>) {
  const isCompact = size === 'compact';
  const isHomeVariant = variant === 'home';
  const safeOptionCount = Math.max(options.length, 1);
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const totalHorizontalPadding = isHomeVariant || isCompact ? 8 : 12;
  const segmentWidth = useSharedValue(0);
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth.value > 0) {
      indicatorX.value = withSpring(activeIndex * segmentWidth.value, springPresets.snappy);
    }
  }, [activeIndex, indicatorX, segmentWidth]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const totalWidth = event.nativeEvent.layout.width - totalHorizontalPadding;
      const width = totalWidth / safeOptionCount;
      segmentWidth.value = width;
      indicatorX.value = activeIndex * width;
    },
    [activeIndex, indicatorX, safeOptionCount, segmentWidth, totalHorizontalPadding],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: segmentWidth.value,
  }));

  return (
    <View
      className={cn(
        'relative flex-row items-center',
        isHomeVariant
          ? 'rounded-[20px] bg-secondary/40 p-1'
          : 'border border-border/30 bg-secondary/40',
        !isHomeVariant && (isCompact ? 'rounded-2xl p-1' : 'rounded-[22px] p-1.5'),
        className,
      )}
      onLayout={handleLayout}
    >
      <Animated.View
        className={cn(
          'absolute',
          isHomeVariant
            ? 'left-1 top-1 bottom-1 rounded-[16px] border border-border/30 bg-card shadow-soft'
            : 'bg-primary shadow-glow',
          !isHomeVariant &&
            (isCompact
              ? 'left-1 top-1 bottom-1 rounded-xl'
              : 'left-1.5 top-1.5 bottom-1.5 rounded-[16px]'),
        )}
        style={indicatorStyle}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            disabled={option.disabled}
            onPress={() => {
              if (option.disabled || active) return;
              void triggerHaptic('selection');
              onChange(option.value);
            }}
            className={cn(
              isHomeVariant
                ? 'min-h-[40px] min-w-[64px] flex-1 items-center justify-center rounded-[16px] px-3 py-2.5 z-10'
                : isCompact
                  ? 'min-h-[34px] min-w-[54px] flex-1 items-center justify-center rounded-xl px-2 py-1 z-10'
                  : 'min-h-[44px] min-w-[64px] flex-1 items-center justify-center rounded-[16px] px-3 py-2 z-10',
              option.disabled && 'opacity-45',
            )}
          >
            <Text
              variant="caption"
              className={cn(
                isHomeVariant
                  ? active
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                  : active
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
