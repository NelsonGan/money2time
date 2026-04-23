import React, { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';

type LoadingDotsSize = 'small' | 'large';

interface LoadingDotsProps {
  color?: string;
  size?: LoadingDotsSize;
  style?: ViewStyle;
}

const DIMENSIONS: Record<LoadingDotsSize, { dot: number; gap: number; container: number }> = {
  small: { dot: 7, gap: 6, container: 10 },
  large: { dot: 11, gap: 8, container: 14 },
};

function Dot({ delay, color, size }: { delay: number; color: string; size: number }) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 360 }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(v);
  }, [v, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + v.value * 0.65,
    transform: [{ scale: 0.55 + v.value * 0.45 }],
  }));

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

export function LoadingDots({ color, size = 'small', style }: LoadingDotsProps) {
  const themeColors = useThemeColors();
  const resolvedColor = color ?? themeColors.primary;
  const d = DIMENSIONS[size];
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: d.gap, height: d.container },
        style,
      ]}
    >
      <Dot delay={0} color={resolvedColor} size={d.dot} />
      <Dot delay={150} color={resolvedColor} size={d.dot} />
      <Dot delay={300} color={resolvedColor} size={d.dot} />
    </View>
  );
}
