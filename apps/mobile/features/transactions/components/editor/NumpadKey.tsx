import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export type KeyValue = string;

// Stable icon elements for the combo operator keys — hoisted so their identity
// doesn't change per keystroke, keeping NumpadKey's React.memo effective.
export const MINUS_DIVIDE_ICON = (
  <Text variant="subheading" className="text-primary">
    {'−   ÷'}
  </Text>
);
export const PLUS_TIMES_ICON = (
  <Text variant="subheading" className="text-primary">
    {'+   ×'}
  </Text>
);

export const NumpadKey = React.memo(function NumpadKey({
  value,
  onPress,
  onLongPress,
  variant = 'default',
  icon,
  className,
}: {
  value: KeyValue;
  onPress: (key: KeyValue) => void;
  onLongPress?: () => void;
  variant?: 'default' | 'operator' | 'utility' | 'confirm';
  icon?: React.ReactNode;
  className?: string;
}) {
  const pressProgress = useSharedValue(0);
  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressProgress.value * 0.12 }],
    opacity: 1 - pressProgress.value * 0.32,
  }));
  const tapFlash = useSharedValue(0);
  const tapFlashStyle = useAnimatedStyle(() => ({
    opacity: tapFlash.value,
  }));
  const tapOverlayClassName =
    variant === 'confirm'
      ? 'bg-primary-foreground/28'
      : variant === 'operator'
        ? 'bg-primary/20'
        : 'bg-foreground/12';
  const rippleColor = variant === 'confirm' ? 'rgba(255,255,255,0.28)' : 'rgba(34, 138, 111, 0.2)';

  const handlePressIn = useCallback(() => {
    pressProgress.value = withTiming(1, {
      duration: 70,
      easing: Easing.out(Easing.quad),
    });
    tapFlash.value = withSequence(
      withTiming(0.32, {
        duration: 45,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, {
        duration: 160,
        easing: Easing.in(Easing.quad),
      }),
    );
    void triggerHaptic('light');
    onPress(value);
  }, [onPress, pressProgress, tapFlash, value]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
  }, [pressProgress]);

  return (
    <View className={cn('flex-1', className)}>
      <Animated.View style={[pressAnimatedStyle, { flex: 1 }]}>
        <Pressable
          onPressIn={handlePressIn}
          onLongPress={onLongPress}
          onPressOut={handlePressOut}
          unstable_pressDelay={0}
          android_disableSound
          android_ripple={{ color: rippleColor, borderless: false }}
          className={cn(
            'relative flex-1 overflow-hidden rounded-[18px] items-center justify-center border',
            variant === 'confirm' && 'bg-primary border-primary/60',
            variant === 'operator' && 'bg-primary/10 border-primary/35',
            variant === 'utility' && 'bg-secondary border-border/45',
            variant === 'default' && 'bg-card border-border/40',
          )}
        >
          {icon ?? (
            <Text
              variant={variant === 'confirm' ? 'bodyStrong' : 'subheading'}
              className={cn(
                variant === 'confirm' ? 'text-primary-foreground' : 'text-foreground',
                variant === 'operator' && 'text-primary',
              )}
            >
              {value}
            </Text>
          )}
          <Animated.View
            pointerEvents="none"
            className={cn('absolute inset-0 rounded-[18px]', tapOverlayClassName)}
            style={tapFlashStyle}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});
