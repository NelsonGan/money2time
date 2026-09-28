import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Circular gauge for the savings-rate hero card. Draws a soft track, a
 * round-capped progress arc, and a small dot marking the healthy-rate goal
 * on the ring. Center content (icon, text) renders as children.
 */
export function SavingsRateRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  goal,
  goalColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  /** Arc fill, clamped to 0–1. */
  progress: number;
  color: string;
  trackColor: string;
  /** Goal marker position on the ring, 0–1. Omit to hide the marker. */
  goal?: number;
  goalColor?: string;
  children?: React.ReactNode;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const reducedMotion = useReducedMotion();
  const animatedProgress = useSharedValue(reducedMotion ? clamped : 0);
  const goalAngle = goal === undefined ? null : -Math.PI / 2 + goal * 2 * Math.PI;

  useEffect(() => {
    animatedProgress.set(
      reducedMotion ? clamped : withTiming(clamped, { duration: 240, easing: EASE_OUT }),
    );
  }, [animatedProgress, clamped, reducedMotion]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.get()),
    opacity: animatedProgress.get() > 0 ? 1 : 0,
  }));

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={arcProps}
          transform={`rotate(-90 ${center} ${center})`}
        />
        {goalAngle !== null && goalColor ? (
          <Circle
            cx={center + radius * Math.cos(goalAngle)}
            cy={center + radius * Math.sin(goalAngle)}
            r={Math.max(2, strokeWidth / 2 - 1.5)}
            fill={goalColor}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
