import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

const DOTS = [0, 1, 2] as const;
const STEP_MS = 320;

interface LoadingDotsProps {
  /** Dot colour; the theme's primary by default. */
  color?: string;
  /** Dot diameter. */
  size?: number;
  accessibilityLabel?: string;
}

/**
 * Three dots rising in turn: the app's loader. It keeps the size of what it
 * replaces (a button label, a line of text), so nothing around it moves while
 * work runs. With Reduce Motion on, the dots hold still at stepped opacity.
 */
export function LoadingDots({ color, size = 8, accessibilityLabel }: LoadingDotsProps) {
  const themeColors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const fill = color ?? themeColors.primary;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? I18n.t('common.loading')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: size * 0.75,
        height: size * 2.5,
      }}
    >
      {DOTS.map((index) => (
        <Dot key={index} index={index} color={fill} size={size} still={reduceMotion} />
      ))}
    </View>
  );
}

function Dot({
  index,
  color,
  size,
  still,
}: {
  index: number;
  color: string;
  size: number;
  still: boolean;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    progress.value = withDelay(
      index * (STEP_MS / 2),
      withRepeat(
        withSequence(
          withTiming(1, { duration: STEP_MS, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: STEP_MS, easing: Easing.in(Easing.quad) }),
          // Rest so the three read as a wave, not a jitter.
          withTiming(0, { duration: STEP_MS }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [index, progress, still]);

  const style = useDotStyle(progress, size, still, index);
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

function useDotStyle(progress: SharedValue<number>, size: number, still: boolean, index: number) {
  return useAnimatedStyle(() => {
    if (still) return { opacity: 1 - index * 0.3, transform: [{ translateY: 0 }] };
    return {
      opacity: 0.35 + progress.value * 0.65,
      transform: [{ translateY: -progress.value * size * 0.6 }],
    };
  });
}
