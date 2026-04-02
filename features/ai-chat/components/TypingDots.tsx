import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface TypingDotsProps {
  color: string;
  dotSize?: number;
  gap?: number;
}

function Dot({
  color,
  size,
  delay,
}: {
  color: string;
  size: number;
  delay: number;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 280 }),
          withTiming(0, { duration: 280 }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0.4, { duration: 280 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export function TypingDots({ color, dotSize = 6, gap = 5 }: TypingDotsProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap, height: dotSize + 8 }}>
      <Dot color={color} size={dotSize} delay={0} />
      <Dot color={color} size={dotSize} delay={160} />
      <Dot color={color} size={dotSize} delay={320} />
    </View>
  );
}
