import type { ViewStyle } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

const MOVE_EASE = cubicBezier(0.77, 0, 0.175, 1);

/** An absolute, childless fill can change width without reflowing its row. */
export function AnimatedProgressFill({
  ratio,
  color,
  style,
}: {
  ratio: number;
  color: string;
  style?: ViewStyle;
}) {
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(ratio, 1));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: color,
          transitionProperty: 'width',
          transitionDuration: reducedMotion ? '0ms' : '200ms',
          transitionTimingFunction: MOVE_EASE,
        },
        style,
      ]}
    />
  );
}
