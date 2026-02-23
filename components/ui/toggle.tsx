import React, { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
import { cn } from '~/utils';
import { triggerHaptic } from '~/services/haptics';
import { springPresets } from '~/constants/motion';

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
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedToggleProps<T>) {
  const activeIndex = options.findIndex((opt) => opt.value === value);
  const segmentWidth = useSharedValue(0);
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth.value > 0) {
      indicatorX.value = withSpring(activeIndex * segmentWidth.value, springPresets.snappy);
    }
  }, [activeIndex, indicatorX, segmentWidth]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const totalWidth = event.nativeEvent.layout.width - 12; // subtract padding
      const width = totalWidth / options.length;
      segmentWidth.value = width;
      indicatorX.value = activeIndex * width;
    },
    [activeIndex, indicatorX, options.length, segmentWidth],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: segmentWidth.value,
  }));

  return (
    <View
      className={cn(
        'relative flex-row items-center rounded-3xl border border-border/50 bg-card p-1.5',
        className,
      )}
      onLayout={handleLayout}
    >
      <Animated.View
        className="absolute left-1.5 top-1.5 bottom-1.5 rounded-2xl bg-primary"
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
              'min-h-[44px] min-w-[64px] flex-1 items-center justify-center rounded-2xl px-3 py-2 z-10',
              option.disabled && 'opacity-45',
            )}
          >
            <Text
              variant="caption"
              className={cn(active ? 'text-primary-foreground' : 'text-muted-foreground')}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
