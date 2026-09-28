import { useEffect, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const PROGRESS_DURATION = 280;

/** An absolute, childless fill can change width without reflowing its row. */
export function AnimatedProgressFill({
  ratio,
  color,
  style,
  revealOnMount = false,
  revealDelayMs = 0,
  changeDelayMs = 0,
}: {
  ratio: number;
  color: string;
  style?: ViewStyle;
  revealOnMount?: boolean;
  revealDelayMs?: number;
  changeDelayMs?: number;
}) {
  const reducedMotion = useReducedMotion();
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(ratio, 1)) : 0;
  const firstUpdate = useRef(true);
  const animatedRatio = useSharedValue(reducedMotion || !revealOnMount ? clamped : 0);

  useEffect(() => {
    const delay = firstUpdate.current ? (revealOnMount ? revealDelayMs : 0) : changeDelayMs;
    firstUpdate.current = false;
    animatedRatio.set(
      reducedMotion
        ? clamped
        : withDelay(
            delay,
            withTiming(clamped, { duration: PROGRESS_DURATION, easing: Easing.linear }),
          ),
    );
  }, [animatedRatio, clamped, reducedMotion, revealDelayMs, revealOnMount, changeDelayMs]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${animatedRatio.get() * 100}%` }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          height: '100%',
          backgroundColor: color,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
