import { type ReactNode, useEffect, useRef } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** A single, quiet emphasis when an occasional financial total changes. */
export function ValuePulse({
  valueKey,
  children,
  delayMs = 0,
}: {
  valueKey: number;
  children: ReactNode;
  delayMs?: number;
}) {
  const reducedMotion = useReducedMotion();
  const previousValue = useRef(valueKey);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (previousValue.current === valueKey) return;
    previousValue.current = valueKey;
    if (reducedMotion) return;
    scale.set(
      withDelay(
        delayMs,
        withSequence(
          withTiming(1.05, { duration: 100, easing: EASE_OUT }),
          withTiming(1, { duration: 170, easing: EASE_IN_OUT }),
        ),
      ),
    );
  }, [delayMs, reducedMotion, scale, valueKey]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
